package main

import "testing"

func TestHashPassword_DeterministicAndDistinct(t *testing.T) {
	if hashPassword("password") != hashPassword("password") {
		t.Error("hashPassword is not deterministic")
	}
	if hashPassword("password") == hashPassword("Password") {
		t.Error("hashPassword should be case-sensitive")
	}
	if hashPassword("a") == hashPassword("b") {
		t.Error("different inputs produced equal hashes")
	}
}

func TestHashPassword_KnownFixture(t *testing.T) {
	// Locks the hash of the seeded demo password so a silent change to the
	// salt or algorithm breaks the build instead of silently invalidating
	// every existing user's stored hash.
	const wantAlicePasswordHash = "4dbd9931884b96ca662c42a58da9e91daa3af25571e06f4e572972593fe561a0"
	if got := hashPassword("password"); got != wantAlicePasswordHash {
		t.Errorf("hashPassword(\"password\") = %q, want %q (did the salt change?)", got, wantAlicePasswordHash)
	}
}
