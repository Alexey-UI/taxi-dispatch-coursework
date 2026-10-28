package taxi

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

//go:embed schema.sql
var schema embed.FS

type Store struct {
	DB           *pgxpool.Pool
	Redis        *redis.Client
	Service      string
	OfferTimeout time.Duration
}

func ID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func Open(ctx context.Context, dsn, addr, service string, offerTimeout time.Duration) (*Store, error) {
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	s := &Store{DB: db, Redis: redis.NewClient(&redis.Options{Addr: addr, DialTimeout: time.Second, ReadTimeout: 2 * time.Second, WriteTimeout: time.Second}), Service: service, OfferTimeout: offerTimeout}
	if err = db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(731001)"); err != nil {
		return err
	}
	b, _ := schema.ReadFile("schema.sql")
	if _, err = tx.Exec(ctx, string(b)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (s *Store) Close() { s.DB.Close(); s.Redis.Close() }
func (s *Store) Notify(ctx context.Context) {
	c, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
	defer cancel()
	// The list is a bounded wake-up signal. PostgreSQL retains all actual work.
	pipe := s.Redis.TxPipeline()
	pipe.LPush(c, "dispatch:wakeup", "1")
	pipe.LTrim(c, "dispatch:wakeup", 0, 99)
	if _, err := pipe.Exec(c); err != nil {
		slog.Warn("redis notification unavailable", "service", s.Service, "fallback", "postgres scan")
	}
}
func (s *Store) Event(ctx context.Context, tx pgx.Tx, kind, id, message string) error {
	_, err := tx.Exec(ctx, "INSERT INTO events(service,kind,order_id,message) VALUES($1,$2,NULLIF($3,''),$4)", s.Service, kind, id, message)
	if err == nil {
		slog.Info(message, "service", s.Service, "kind", kind, "order_id", id)
	}
	return err
}
func (s *Store) JSONQuery(ctx context.Context, query string, args ...any) (json.RawMessage, error) {
	var result []byte
	err := s.DB.QueryRow(ctx, "SELECT COALESCE(json_agg(t),'[]'::json) FROM ("+query+") t", args...).Scan(&result)
	return result, err
}

func (s *Store) Dispatch(ctx context.Context) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked bool
	if err = tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(731002)").Scan(&locked); err != nil {
		return err
	}
	if !locked {
		return nil
	}
	// Global scheduler lock makes timeout/release and assignment one atomic transaction.
	rows, err := tx.Query(ctx, "SELECT id,driver_id FROM orders WHERE status='offered' AND offer_expires<now() FOR UPDATE")
	if err != nil {
		return err
	}
	type expired struct{ id, driver string }
	list := []expired{}
	for rows.Next() {
		var e expired
		if err = rows.Scan(&e.id, &e.driver); err != nil {
			rows.Close()
			return err
		}
		list = append(list, e)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, e := range list {
		if _, err = tx.Exec(ctx, "UPDATE drivers SET status='available' WHERE id=$1", e.driver); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE orders SET status='pending',driver_id=NULL,offer_expires=NULL,updated_at=now() WHERE id=$1", e.id); err != nil {
			return err
		}
		if err = s.Event(ctx, tx, "offer_expired", e.id, "Время ответа истекло; повторный поиск водителя"); err != nil {
			return err
		}
	}
	// Old attempts become eligible again after 30 seconds, avoiding permanent starvation.
	if _, err = tx.Exec(ctx, "DELETE FROM attempts WHERE created_at < now()-interval '30 seconds'"); err != nil {
		return err
	}
	for range 32 {
		var oid string
		var x, y float64
		var class string
		err = tx.QueryRow(ctx, `SELECT o.id,o.pickup_x,o.pickup_y,o.class FROM orders o
   WHERE o.status='pending' AND EXISTS(SELECT 1 FROM drivers d WHERE d.status='available' AND (o.class='economy' OR d.class='comfort')
    AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.order_id=o.id AND a.driver_id=d.id))
   ORDER BY o.created_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED`).Scan(&oid, &x, &y, &class)
		if err == pgx.ErrNoRows {
			break
		}
		if err != nil {
			return err
		}
		var did string
		err = tx.QueryRow(ctx, `SELECT d.id FROM drivers d WHERE status='available' AND ($3='economy' OR class='comfort')
   AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.order_id=$4 AND a.driver_id=d.id)
   ORDER BY ((x-$1)*(x-$1)+(y-$2)*(y-$2)),d.id LIMIT 1 FOR UPDATE SKIP LOCKED`, x, y, class, oid).Scan(&did)
		if err == pgx.ErrNoRows {
			continue
		}
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE drivers SET status='offered' WHERE id=$1", did); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE orders SET status='offered',driver_id=$2,offer_expires=now()+$3*interval '1 second',updated_at=now() WHERE id=$1", oid, did, s.OfferTimeout.Seconds()); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "INSERT INTO attempts(order_id,driver_id) VALUES($1,$2) ON CONFLICT DO NOTHING", oid, did); err != nil {
			return err
		}
		if err = s.Event(ctx, tx, "driver_offered", oid, fmt.Sprintf("Заказ предложен ближайшему водителю %s", did)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) Worker(ctx context.Context) {
	slog.Info("dispatcher started", "service", s.Service)
	for ctx.Err() == nil {
		tick, cancel := context.WithTimeout(ctx, 5*time.Second)
		err := s.Dispatch(tick)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("dispatch tick failed", "service", s.Service, "error", err.Error())
		}
		wait, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
		_, err = s.Redis.BRPop(wait, time.Second, "dispatch:wakeup").Result()
		cancel()
		if err != nil && err != redis.Nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		}
	}
}
