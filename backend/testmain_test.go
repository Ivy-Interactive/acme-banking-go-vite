package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// newTestDB swaps the package-level db for an isolated SQLite database backed
// by a tempfile (modernc.org/sqlite supports :memory: but a tempfile keeps
// behaviour identical to production while still being torn down per test).
// If seed is true, seedData() runs and the three demo users are present.
func newTestDB(t *testing.T, seed bool) {
	t.Helper()
	prev := db
	dbFile := filepath.Join(t.TempDir(), "test.db")
	if err := initDB(dbFile); err != nil {
		t.Fatalf("initDB: %v", err)
	}
	if seed {
		if err := seedData(); err != nil {
			t.Fatalf("seedData: %v", err)
		}
	}
	t.Cleanup(func() {
		_ = db.Close()
		db = prev
	})
}

// loginAs creates a session for the given username and returns the bearer token.
func loginAs(t *testing.T, username string) string {
	t.Helper()
	var id int64
	if err := db.QueryRow("SELECT id FROM users WHERE username = ?", username).Scan(&id); err != nil {
		t.Fatalf("lookup user %s: %v", username, err)
	}
	token, _, err := createSession(id)
	if err != nil {
		t.Fatalf("createSession: %v", err)
	}
	return token
}

// userID returns the primary key of a seeded user.
func userID(t *testing.T, username string) int64 {
	t.Helper()
	var id int64
	if err := db.QueryRow("SELECT id FROM users WHERE username = ?", username).Scan(&id); err != nil {
		t.Fatalf("userID(%s): %v", username, err)
	}
	return id
}

// userBalance returns the current balance_cents for a seeded user.
func userBalance(t *testing.T, username string) int64 {
	t.Helper()
	var b int64
	if err := db.QueryRow("SELECT balance_cents FROM users WHERE username = ?", username).Scan(&b); err != nil {
		t.Fatalf("userBalance(%s): %v", username, err)
	}
	return b
}

// newTestServer mounts the same routes main.go does behind withCORS.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(withCORS(buildMux()))
	t.Cleanup(srv.Close)
	return srv
}

// doJSON sends a JSON request and returns (status, raw body bytes, parsed object).
// body may be nil for GET/DELETE.
func doJSON(t *testing.T, srv *httptest.Server, method, path, token string, body any) (int, []byte, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		switch b := body.(type) {
		case []byte:
			reader = bytes.NewReader(b)
		case string:
			reader = bytes.NewReader([]byte(b))
		default:
			buf, err := json.Marshal(body)
			if err != nil {
				t.Fatalf("marshal request: %v", err)
			}
			reader = bytes.NewReader(buf)
		}
	}
	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return res.StatusCode, raw, out
}

// doJSONList is like doJSON but returns the body parsed as a slice (for endpoints
// returning a top-level array such as /api/transactions).
func doJSONList(t *testing.T, srv *httptest.Server, method, path, token string, body any) (int, []map[string]any) {
	t.Helper()
	status, raw, _ := doJSON(t, srv, method, path, token, body)
	var out []map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("unmarshal list: %v (body=%s)", err, string(raw))
		}
	}
	return status, out
}

// txCount returns the number of transaction rows in the database (any user).
func txCount(t *testing.T) int {
	t.Helper()
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM transactions").Scan(&n); err != nil {
		t.Fatalf("txCount: %v", err)
	}
	return n
}

// mustExec runs a query with arguments and fails the test on error.
func mustExec(t *testing.T, query string, args ...any) sql.Result {
	t.Helper()
	res, err := db.Exec(query, args...)
	if err != nil {
		t.Fatalf("exec %q: %v", query, err)
	}
	return res
}
