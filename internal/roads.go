package taxi

import (
	_ "embed"
	"encoding/json"
	"math"
)

//go:embed city.json
var cityJSON []byte

type CityConfig struct {
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	MinX       float64 `json:"min_x"`
	MaxX       float64 `json:"max_x"`
	MinY       float64 `json:"min_y"`
	MaxY       float64 `json:"max_y"`
	StreetStep float64 `json:"street_step"`
	Speed      float64 `json:"speed"`
}

var City = func() CityConfig {
	var c CityConfig
	if err := json.Unmarshal(cityJSON, &c); err != nil {
		panic(err)
	}
	return c
}()

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func SnapRoad(p Point) Point {
	x := City.MinX + math.Round((p.X-City.MinX)/City.StreetStep)*City.StreetStep
	y := City.MinY + math.Round((p.Y-City.MinY)/City.StreetStep)*City.StreetStep
	x = math.Max(City.MinX, math.Min(City.MaxX, x))
	y = math.Max(City.MinY, math.Min(City.MaxY, y))
	if math.Abs(p.X-x) <= math.Abs(p.Y-y) {
		p.X = x
	} else {
		p.Y = y
	}
	return p
}

func isAxis(value, origin float64) bool {
	return math.Abs((value-origin)/City.StreetStep-math.Round((value-origin)/City.StreetStep)) < 1e-8
}
func OnRoad(p Point) bool {
	return ValidPoint(p.X, p.Y) && (isAxis(p.X, City.MinX) || isAxis(p.Y, City.MinY))
}
func manhattan(a, b Point) float64 { return math.Abs(a.X-b.X) + math.Abs(a.Y-b.Y) }
func entrances(p Point) []Point {
	if isAxis(p.X, City.MinX) && isAxis(p.Y, City.MinY) {
		return []Point{p}
	}
	if isAxis(p.X, City.MinX) {
		y := City.MinY + math.Floor((p.Y-City.MinY)/City.StreetStep)*City.StreetStep
		return []Point{{p.X, y}, {p.X, math.Min(City.MaxY, y+City.StreetStep)}}
	}
	x := City.MinX + math.Floor((p.X-City.MinX)/City.StreetStep)*City.StreetStep
	return []Point{{x, p.Y}, {math.Min(City.MaxX, x+City.StreetStep), p.Y}}
}

// RoadDistance is the shortest distance on the connected rectangular street grid.
// Endpoints inside a street edge must first reach an adjacent intersection.
func RoadDistance(a, b Point) float64 {
	a = SnapRoad(a)
	b = SnapRoad(b)
	if (math.Abs(a.X-b.X) < 1e-8 && isAxis(a.X, City.MinX)) || (math.Abs(a.Y-b.Y) < 1e-8 && isAxis(a.Y, City.MinY)) {
		return manhattan(a, b)
	}
	best := math.Inf(1)
	for _, entry := range entrances(a) {
		for _, exit := range entrances(b) {
			best = math.Min(best, manhattan(a, entry)+manhattan(entry, exit)+manhattan(exit, b))
		}
	}
	return best
}
