package taxi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Actor struct {
	ID       string `json:"id"`
	Role     string `json:"role"`
	DriverID string `json:"driver_id,omitempty"`
	Expires  int64  `json:"expires"`
}
type API struct {
	s                                *Store
	sessionKey, serviceKey, password string
	secure, public                   bool
}

func NewAPI(s *Store, sessionKey, serviceKey, password string, secure, public bool) (*API, error) {
	if len(sessionKey) < 32 || len(serviceKey) < 32 || len(password) < 12 {
		return nil, errors.New("SESSION_KEY/SERVICE_KEY require 32 characters; DEMO_PASSWORD requires 12")
	}
	return &API{s: s, sessionKey: sessionKey, serviceKey: serviceKey, password: password, secure: secure, public: public}, nil
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "Некорректное тело запроса")
		return false
	}
	return true
}
func (a *API) signature(s string) string {
	h := hmac.New(sha256.New, []byte(a.sessionKey))
	h.Write([]byte(s))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}
func (a *API) cookie(w http.ResponseWriter, u Actor) {
	u.Expires = time.Now().Add(12 * time.Hour).Unix()
	b, _ := json.Marshal(u)
	p := base64.RawURLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{Name: "taxi_session", Value: p + "." + a.signature(p), Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteStrictMode, MaxAge: 43200})
}
func (a *API) actor(r *http.Request) Actor {
	if v := r.Header.Get("X-Service-Key"); v != "" && subtle.ConstantTimeCompare([]byte(v), []byte(a.serviceKey)) == 1 {
		return Actor{ID: "simulator", Role: "system"}
	}
	c, err := r.Cookie("taxi_session")
	if err != nil {
		return Actor{Role: "observer"}
	}
	p := strings.Split(c.Value, ".")
	if len(p) != 2 || !hmac.Equal([]byte(a.signature(p[0])), []byte(p[1])) {
		return Actor{Role: "observer"}
	}
	b, err := base64.RawURLEncoding.DecodeString(p[0])
	var u Actor
	if err != nil || json.Unmarshal(b, &u) != nil || u.Expires < time.Now().Unix() {
		return Actor{Role: "observer"}
	}
	return u
}
func privileged(u Actor) bool { return u.Role == "admin" || u.Role == "system" }
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		c, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if a.s.DB.Ping(c) != nil {
			fail(w, 503, "database unavailable")
			return
		}
		write(w, 200, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /api/session", func(w http.ResponseWriter, r *http.Request) { write(w, 200, a.actor(r)) })
	mux.HandleFunc("POST /api/auth/guest", func(w http.ResponseWriter, r *http.Request) {
		if !a.public {
			fail(w, 403, "Гостевые заказы отключены")
			return
		}
		u := a.actor(r)
		if u.Role == "observer" {
			u = Actor{ID: ID(), Role: "passenger"}
		}
		a.cookie(w, u)
		write(w, 200, u)
	})
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "taxi_session", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteStrictMode})
		write(w, 200, map[string]bool{"ok": true})
	})
	mux.HandleFunc("GET /api/state", a.state)
	mux.HandleFunc("POST /api/orders", a.createOrder)
	mux.HandleFunc("POST /api/orders/{id}/{action}", a.action)
	mux.HandleFunc("POST /api/drivers/{id}/position", a.position)
	mux.HandleFunc("GET /api/simulation", a.getSimulation)
	mux.HandleFunc("POST /api/simulation", a.setSimulation)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		id := ID()
		w.Header().Set("X-Request-ID", id)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		// Same-origin JSON mutations + strict cookies prevent cross-site form/JSON CSRF.
		if r.Method == "POST" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			fail(w, 415, "Требуется application/json")
			return
		}
		if r.Method == "POST" && r.Header.Get("Sec-Fetch-Site") == "cross-site" {
			fail(w, 403, "Cross-site request rejected")
			return
		}
		defer func() {
			if v := recover(); v != nil {
				slog.Error("request panic", "service", "api", "request_id", id)
				fail(w, 500, "Внутренняя ошибка")
			}
			slog.Info("request completed", "service", "api", "method", r.Method, "path", r.URL.Path, "request_id", id, "duration_ms", time.Since(started).Milliseconds())
		}()
		mux.ServeHTTP(w, r)
	})
}
func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role     string `json:"role"`
		Password string `json:"password"`
		DriverID string `json:"driver_id"`
	}
	if !decode(w, r, &in) {
		return
	}
	if subtle.ConstantTimeCompare([]byte(in.Password), []byte(a.password)) != 1 {
		fail(w, 401, "Неверные данные входа")
		return
	}
	if in.Role != "admin" && in.Role != "driver" {
		fail(w, 400, "Допустимы admin и driver")
		return
	}
	u := Actor{ID: in.Role, Role: in.Role}
	if in.Role == "driver" {
		var exists bool
		if err := a.s.DB.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM drivers WHERE id=$1)", in.DriverID).Scan(&exists); err != nil || !exists {
			fail(w, 400, "Водитель не найден")
			return
		}
		u.ID = in.DriverID
		u.DriverID = in.DriverID
	}
	a.cookie(w, u)
	write(w, 200, u)
}
func (a *API) state(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u := a.actor(r)
	drivers, err := a.s.JSONQuery(ctx, "SELECT id,name,class,x,y,status FROM drivers ORDER BY id")
	if err != nil {
		a.serverError(w, err)
		return
	}
	// Public state deliberately excludes passenger identity and authentication fields.
	orders, err := a.s.JSONQuery(ctx, `SELECT id,pickup_x,pickup_y,dropoff_x,dropoff_y,class,status,driver_id,offer_expires,created_at,updated_at,
  (owner_id=$1) AS mine FROM orders WHERE status NOT IN ('completed','cancelled') OR updated_at>now()-interval '60 seconds' ORDER BY created_at DESC LIMIT 150`, u.ID)
	if err != nil {
		a.serverError(w, err)
		return
	}
	events, err := a.s.JSONQuery(ctx, "SELECT id,service,kind,order_id,message,created_at FROM events ORDER BY id DESC LIMIT 80")
	if err != nil {
		a.serverError(w, err)
		return
	}
	stats, err := a.s.JSONQuery(ctx, "SELECT status,count(*) AS count FROM orders GROUP BY status")
	if err != nil {
		a.serverError(w, err)
		return
	}
	write(w, 200, map[string]any{"drivers": drivers, "orders": orders, "events": events, "stats": stats, "actor": u, "public_participation": a.public, "city": City})
}
func (a *API) createOrder(w http.ResponseWriter, r *http.Request) {
	u := a.actor(r)
	if u.Role != "passenger" && !privileged(u) {
		fail(w, 403, "Войдите как пассажир")
		return
	}
	var in struct {
		PickupX  float64 `json:"pickup_x"`
		PickupY  float64 `json:"pickup_y"`
		DropoffX float64 `json:"dropoff_x"`
		DropoffY float64 `json:"dropoff_y"`
		Class    string  `json:"class"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !ValidPoint(in.PickupX, in.PickupY) || !ValidPoint(in.DropoffX, in.DropoffY) || (in.Class != "economy" && in.Class != "comfort") {
		fail(w, 400, "Координаты X: 5–195, Y: 5–135; маршрут от 3 единиц; класс economy/comfort")
		return
	}
	pickup, dropoff := SnapRoad(Point{in.PickupX, in.PickupY}), SnapRoad(Point{in.DropoffX, in.DropoffY})
	in.PickupX, in.PickupY, in.DropoffX, in.DropoffY = pickup.X, pickup.Y, dropoff.X, dropoff.Y
	if RoadDistance(pickup, dropoff) < 3 {
		fail(w, 400, "Точки на дорогах слишком близко друг к другу")
		return
	}
	ctx := r.Context()
	tx, err := a.s.DB.Begin(ctx)
	if err != nil {
		a.serverError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	// One global admission lock also bounds abusive creation across multiple API replicas.
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(731003)"); err != nil {
		a.serverError(w, err)
		return
	}
	var active, recent, mine int
	err = tx.QueryRow(ctx, `SELECT count(*) FILTER(WHERE status NOT IN ('completed','cancelled')),count(*) FILTER(WHERE created_at>now()-interval '1 minute'),count(*) FILTER(WHERE owner_id=$1 AND status NOT IN ('completed','cancelled')) FROM orders`, u.ID).Scan(&active, &recent, &mine)
	if err != nil {
		a.serverError(w, err)
		return
	}
	if active >= 120 || recent >= 180 || (!privileged(u) && mine >= 2) {
		fail(w, 429, "Лимит активных заказов; дождитесь завершения поездки")
		return
	}
	id := ID()
	origin := "guest"
	if u.Role == "system" {
		origin = "simulation"
	}
	_, err = tx.Exec(ctx, `INSERT INTO orders(id,owner_id,origin,pickup_x,pickup_y,dropoff_x,dropoff_y,class) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id, u.ID, origin, in.PickupX, in.PickupY, in.DropoffX, in.DropoffY, in.Class)
	if err == nil {
		err = a.s.Event(ctx, tx, "order_created", id, "Создан заказ; ожидается свободный водитель")
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		a.serverError(w, err)
		return
	}
	a.s.Notify(ctx)
	write(w, 201, map[string]string{"id": id, "status": "pending"})
}
func (a *API) action(w http.ResponseWriter, r *http.Request) {
	u := a.actor(r)
	id, action := r.PathValue("id"), r.PathValue("action")
	ctx := r.Context()
	tx, err := a.s.DB.Begin(ctx)
	if err != nil {
		a.serverError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	var status, owner string
	var driver *string
	err = tx.QueryRow(ctx, "SELECT status,owner_id,driver_id FROM orders WHERE id=$1 FOR UPDATE", id).Scan(&status, &owner, &driver)
	if err == pgx.ErrNoRows {
		fail(w, 404, "Заказ не найден")
		return
	}
	if err != nil {
		a.serverError(w, err)
		return
	}
	allowed := privileged(u) || (action == "cancel" && u.Role == "passenger" && u.ID == owner) || (action != "cancel" && u.Role == "driver" && driver != nil && *driver == u.DriverID)
	if !allowed {
		fail(w, 403, "Нет прав на изменение заказа")
		return
	}
	next, err := NextState(status, action)
	if err != nil {
		fail(w, 409, err.Error())
		return
	}
	if status == "offered" && action == "accept" {
		var expired bool
		if err = tx.QueryRow(ctx, "SELECT offer_expires<=now() FROM orders WHERE id=$1", id).Scan(&expired); err != nil {
			a.serverError(w, err)
			return
		}
		if expired {
			fail(w, 409, "Предложение истекло")
			return
		}
	}
	if driver != nil {
		ds := "busy"
		if next == "pending" || next == "cancelled" || next == "completed" {
			ds = "available"
		}
		_, err = tx.Exec(ctx, "UPDATE drivers SET status=$2 WHERE id=$1", *driver, ds)
		if err != nil {
			a.serverError(w, err)
			return
		}
	}
	if next == "pending" {
		_, err = tx.Exec(ctx, "UPDATE orders SET status=$2,driver_id=NULL,offer_expires=NULL,updated_at=now() WHERE id=$1", id, next)
	} else {
		_, err = tx.Exec(ctx, "UPDATE orders SET status=$2,offer_expires=NULL,updated_at=now() WHERE id=$1", id, next)
	}
	messages := map[string]string{"accept": "Водитель принял заказ", "decline": "Водитель отказался; повторный поиск", "arrive": "Водитель прибыл к пассажиру", "start": "Поездка началась", "complete": "Поездка завершена", "cancel": "Заказ отменён"}
	if err == nil {
		err = a.s.Event(ctx, tx, "order_"+action, id, messages[action])
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		a.serverError(w, err)
		return
	}
	a.s.Notify(ctx)
	write(w, 200, map[string]string{"id": id, "status": next})
}
func (a *API) position(w http.ResponseWriter, r *http.Request) {
	u := a.actor(r)
	id := r.PathValue("id")
	if !privileged(u) && !(u.Role == "driver" && u.DriverID == id) {
		fail(w, 403, "Нет прав")
		return
	}
	var in struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !ValidPoint(in.X, in.Y) {
		fail(w, 400, "Координаты вне карты")
		return
	}
	point := SnapRoad(Point{in.X, in.Y})
	in.X, in.Y = point.X, point.Y
	result, err := a.s.DB.Exec(r.Context(), "UPDATE drivers SET x=$2,y=$3 WHERE id=$1", id, in.X, in.Y)
	if err != nil {
		a.serverError(w, err)
		return
	}
	if result.RowsAffected() == 0 {
		fail(w, 404, "Водитель не найден")
		return
	}
	write(w, 200, map[string]bool{"ok": true})
}
func (a *API) getSimulation(w http.ResponseWriter, r *http.Request) {
	var running bool
	var scenario string
	if err := a.s.DB.QueryRow(r.Context(), "SELECT running,scenario FROM demo_settings WHERE singleton").Scan(&running, &scenario); err != nil {
		a.serverError(w, err)
		return
	}
	write(w, 200, map[string]any{"running": running, "scenario": scenario})
}
func (a *API) setSimulation(w http.ResponseWriter, r *http.Request) {
	if !privileged(a.actor(r)) {
		fail(w, 403, "Только диспетчер")
		return
	}
	var in struct {
		Running  bool   `json:"running"`
		Scenario string `json:"scenario"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.Scenario != "normal" && in.Scenario != "refusals" && in.Scenario != "shortage" && in.Scenario != "burst" {
		fail(w, 400, "Неизвестный сценарий")
		return
	}
	ctx := r.Context()
	tx, err := a.s.DB.Begin(ctx)
	if err != nil {
		a.serverError(w, err)
		return
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, "UPDATE demo_settings SET running=$1,scenario=$2 WHERE singleton", in.Running, in.Scenario)
	if err == nil {
		err = a.s.Event(ctx, tx, "simulation_changed", "", fmt.Sprintf("Симуляция: %s; запущена: %t", in.Scenario, in.Running))
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		a.serverError(w, err)
		return
	}
	write(w, 200, in)
}
func (a *API) serverError(w http.ResponseWriter, err error) {
	slog.Error("database operation failed", "service", "api", "error", err.Error())
	fail(w, 500, "Ошибка обработки запроса")
}
