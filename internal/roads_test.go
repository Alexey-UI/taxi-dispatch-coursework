package taxi

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

func TestRoadDistances(t *testing.T) {
	b, err := os.ReadFile("road-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		From, To Point
		Distance float64
	}
	if err = json.Unmarshal(b, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		got := RoadDistance(f.From, f.To)
		if math.Abs(got-f.Distance) > 1e-8 {
			t.Errorf("%v -> %v: %v, want %v", f.From, f.To, got, f.Distance)
		}
	}
}
func TestNearestByRoadCanDifferFromStraightLine(t *testing.T) {
	pickup := Point{12, 15}
	a, b := Point{13, 25}, Point{25, 15}
	if Distance(a.X, a.Y, pickup.X, pickup.Y) >= Distance(b.X, b.Y, pickup.X, pickup.Y) {
		t.Fatal("fixture must prefer a by straight line")
	}
	if RoadDistance(a, pickup) <= RoadDistance(b, pickup) {
		t.Fatal("road dispatcher must prefer b")
	}
}
func TestRoadProjectionAndBounds(t *testing.T) {
	for x := 5.0; x <= 195; x += 2.7 {
		for y := 5.0; y <= 135; y += 3.1 {
			p := SnapRoad(Point{x, y})
			if !OnRoad(p) {
				t.Fatal("projection off road", p)
			}
			if SnapRoad(p) != p {
				t.Fatal("projection is not idempotent")
			}
		}
	}
	if !ValidPoint(195, 135) || ValidPoint(196, 135) || ValidPoint(195, 136) {
		t.Fatal("expanded city bounds")
	}
}
