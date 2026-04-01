package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return fn(r)
}

func TestNormalizeSupabaseURL(t *testing.T) {
	got, err := normalizeSupabaseURL("ogqkdzuukhkldkgnddru.supabase.co")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if got != "https://ogqkdzuukhkldkgnddru.supabase.co" {
		t.Fatalf("unexpected normalized url: %s", got)
	}
}

func TestTrimEnv(t *testing.T) {
	got := trimEnv(`  "quoted-value"  `)
	if got != "quoted-value" {
		t.Fatalf("unexpected trimmed env value: %q", got)
	}
}

func TestHandleCreateTaskAddsCurrentUserID(t *testing.T) {
	application := app{
		cfg: config{
			SupabaseURL:     "https://example.supabase.co",
			SupabaseAnonKey: "anon",
			AllowedOrigin:   "http://localhost:5173",
		},
		client: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				switch {
				case strings.Contains(r.URL.Path, "/auth/v1/user"):
					return jsonResponse(`{"id":"guest-user"}`), nil
				case strings.Contains(r.URL.Path, "/rest/v1/tasks"):
					body, _ := io.ReadAll(r.Body)
					if !bytes.Contains(body, []byte(`"user_id":"guest-user"`)) {
						t.Fatalf("expected user_id to be forwarded, body was %s", string(body))
					}
					return jsonResponse(`[{"id":"1","title":"Task","status":"todo","user_id":"guest-user","created_at":"2026-04-01T00:00:00Z","description":null,"priority":"normal","due_date":null,"assignee_id":null}]`), nil
				default:
					t.Fatalf("unexpected request path: %s", r.URL.Path)
					return nil, nil
				}
			}),
		},
	}

	request := httptest.NewRequest(http.MethodPost, "/api/tasks", strings.NewReader(`{"title":"Task","description":"","status":"todo","priority":"normal","dueDate":""}`))
	request.Header.Set("Authorization", "Bearer guest-token")
	recorder := httptest.NewRecorder()

	application.handleCreateTask(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d with body %s", recorder.Code, recorder.Body.String())
	}
}

func TestHandleListTasksRequiresAuth(t *testing.T) {
	application := app{}
	request := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)
	recorder := httptest.NewRecorder()

	application.handleListTasks(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestHandleHealthReturnsOK(t *testing.T) {
	application := app{
		cfg: config{
			SupabaseURL:     "https://example.supabase.co",
			SupabaseAnonKey: "anon",
			AllowedOrigin:   "http://localhost:5173",
		},
		client: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				return jsonResponse(`{"external":{"anonymous_users":true}}`), nil
			}),
		},
	}

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()

	application.handleHealth(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %s", recorder.Code, recorder.Body.String())
	}
}

func jsonResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}
