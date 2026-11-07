package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"strconv"
	"strings"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("usage: make_latency_svg <stats_csv> <out_svg>")
		os.Exit(2)
	}
	in := os.Args[1]
	out := os.Args[2]

	f, err := os.Open(in)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open %s: %v\n", in, err)
		os.Exit(1)
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read csv: %v\n", err)
		os.Exit(1)
	}
	if len(rows) < 1 {
		fmt.Fprintf(os.Stderr, "empty csv\n")
		os.Exit(1)
	}

	head := rows[0]
	idxType := -1
	idxName := -1
	idx50 := -1
	idx95 := -1
	idx99 := -1
	for i, h := range head {
		s := strings.TrimSpace(h)
		if s == "Type" {
			idxType = i
		} else if s == "Name" {
			idxName = i
		} else if s == "50%" {
			idx50 = i
		} else if s == "95%" {
			idx95 = i
		} else if s == "99%" {
			idx99 = i
		}
	}

	if idxType == -1 || idxName == -1 || idx50 == -1 || idx95 == -1 || idx99 == -1 {
		fmt.Fprintf(os.Stderr, "required columns not found in csv header\n")
		os.Exit(1)
	}

	var p50, p95, p99 float64
	found := false
	for _, row := range rows[1:] {
		if len(row) <= idx99 { // skip malformed
			continue
		}
		typeCol := strings.TrimSpace(row[idxType])
		nameCol := strings.TrimSpace(row[idxName])
		if typeCol == "POST" && strings.Contains(nameCol, "/payments") {
			// parse percentiles
			v50, _ := strconv.ParseFloat(strings.TrimSpace(row[idx50]), 64)
			v95, _ := strconv.ParseFloat(strings.TrimSpace(row[idx95]), 64)
			v99, _ := strconv.ParseFloat(strings.TrimSpace(row[idx99]), 64)
			p50 = v50
			p95 = v95
			p99 = v99
			found = true
			break
		}
	}
	if !found {
		fmt.Fprintf(os.Stderr, "payments row not found in stats csv\n")
		os.Exit(1)
	}

	// build SVG
	w := 600
	h := 360
	margin := 40
	barW := 80
	gap := 40
	labels := []string{"P50", "P95", "P99"}
	vals := []float64{p50, p95, p99}
	maxv := p99
	if maxv < 1 {
		maxv = 1
	}

	svg := fmt.Sprintf("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"%d\" height=\"%d\">\n", w, h+margin)
	svg += fmt.Sprintf("<rect width=\"100%%\" height=\"100%%\" fill=\"#ffffff\"/>\n")
	// title
	svg += fmt.Sprintf("<text x=\"%d\" y=\"20\" font-size=16 font-family=Arial>Latency (ms) — /payments</text>\n", margin)

	for i, v := range vals {
		x := margin + i*(barW+gap)
		height := int((v / maxv) * float64(h-2*margin))
		y := margin + (h - 2*margin) - height
		color := "#4c78a8"
		svg += fmt.Sprintf("<rect x=\"%d\" y=\"%d\" width=\"%d\" height=\"%d\" fill=\"%s\"/>\n", x, y, barW, height, color)
		// label value
		svg += fmt.Sprintf("<text x=\"%d\" y=\"%d\" font-size=12 font-family=Arial text-anchor=middle>%0.0f ms</text>\n", x+barW/2, y-6, v)
		// xlabel
		svg += fmt.Sprintf("<text x=\"%d\" y=\"%d\" font-size=12 font-family=Arial text-anchor=middle>%s</text>\n", x+barW/2, h-6, labels[i])
	}

	// y axis ticks
	for i := 0; i <= 5; i++ {
		val := maxv * float64(i) / 5.0
		y := margin + (h - 2*margin) - int((val/maxv)*float64(h-2*margin))
		svg += fmt.Sprintf("<text x=\"%d\" y=\"%d\" font-size=10 font-family=Arial text-anchor=end>%0.0f</text>\n", margin-6, y+4, val)
		svg += fmt.Sprintf("<line x1=\"%d\" y1=\"%d\" x2=\"%d\" y2=\"%d\" stroke=\"#e0e0e0\" stroke-width=1/>\n", margin+10, y, w-margin, y)
	}

	svg += "</svg>\n"

	if err := os.WriteFile(out, []byte(svg), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write svg: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %s (P50=%.0fms P95=%.0fms P99=%.0fms)\n", out, p50, p95, p99)
}
