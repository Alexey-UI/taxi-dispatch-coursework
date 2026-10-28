package taxi

import (
	"errors"
	"math"
)

var ErrConflict = errors.New("действие недоступно в текущем состоянии")

func Distance(x1, y1, x2, y2 float64) float64 { return math.Hypot(x1-x2, y1-y2) }

func ValidPoint(x, y float64) bool {
	return !math.IsNaN(x) && !math.IsNaN(y) && x >= 5 && x <= 95 && y >= 5 && y <= 95
}

func NextState(state, action string) (string, error) {
	switch {
	case state == "offered" && action == "accept":
		return "accepted", nil
	case state == "accepted" && action == "arrive":
		return "arrived", nil
	case state == "arrived" && action == "start":
		return "in_progress", nil
	case state == "in_progress" && action == "complete":
		return "completed", nil
	case state == "offered" && action == "decline":
		return "pending", nil
	case (state == "pending" || state == "offered" || state == "accepted" || state == "arrived") && action == "cancel":
		return "cancelled", nil
	}
	return "", ErrConflict
}
