package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	taxi "taxi-dispatch/internal"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	role := env("SERVICE_ROLE", "api")
	offerTimeout, err := time.ParseDuration(env("OFFER_TIMEOUT", "12s"))
	if err != nil || offerTimeout < time.Second {
		slog.Error("invalid OFFER_TIMEOUT")
		os.Exit(1)
	}
	s, err := taxi.Open(ctx, os.Getenv("DATABASE_URL"), env("REDIS_ADDR", "redis:6379"), role, offerTimeout)
	if err != nil {
		slog.Error("database connection failed")
		os.Exit(1)
	}
	defer s.Close()
	if err = s.Migrate(ctx); err != nil {
		slog.Error("migration failed", "error", err.Error())
		os.Exit(1)
	}
	if role == "dispatcher" {
		s.Worker(ctx)
		return
	}
	api, err := taxi.NewAPI(s, os.Getenv("SESSION_KEY"), os.Getenv("SERVICE_KEY"), os.Getenv("DEMO_PASSWORD"), env("COOKIE_SECURE", "false") == "true", env("PUBLIC_PARTICIPATION", "true") == "true")
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
	srv := &http.Server{Addr: ":8080", Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		<-ctx.Done()
		c, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()
		srv.Shutdown(c)
	}()
	slog.Info("http server started", "service", role, "address", srv.Addr)
	if err = srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("http server failed", "error", err.Error())
		os.Exit(1)
	}
}
