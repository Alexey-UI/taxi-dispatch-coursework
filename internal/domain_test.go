package taxi

import (
	"math"
	"testing"
)

func TestOrderLifecycle(t *testing.T) {
	state := "offered"
	for _, action := range []string{"accept", "arrive", "start", "complete"} {
		next, err := NextState(state, action)
		if err != nil {
			t.Fatal(err)
		}
		state = next
	}
	if state != "completed" {
		t.Fatal(state)
	}
	if _, err := NextState(state, "accept"); err == nil {
		t.Fatal("completed order accepted")
	}
}
func TestTransitionRejections(t *testing.T) {
	for _, state := range []string{"pending", "accepted", "arrived", "in_progress", "completed", "cancelled"} {
		if _, err := NextState(state, "decline"); err == nil {
			t.Fatalf("decline allowed from %s", state)
		}
	}
	if _, err := NextState("in_progress", "cancel"); err == nil {
		t.Fatal("running trip cancelled")
	}
}
func TestCoordinates(t *testing.T) {
	if ValidPoint(math.NaN(), 30) || ValidPoint(math.Inf(1), 30) || ValidPoint(4, 20) {
		t.Fatal("invalid coordinate accepted")
	}
	if Distance(10, 10, 13, 14) != 5 {
		t.Fatal("distance")
	}
}
func TestSessionTampering(t *testing.T) {
	a := &API{sessionKey: "12345678901234567890123456789012"}
	if a.signature("a") == a.signature("b") {
		t.Fatal("invalid signature")
	}
}
