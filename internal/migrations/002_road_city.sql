-- Preserve all existing orders; project legacy coordinates onto the street grid.
CREATE OR REPLACE FUNCTION pg_temp.snap_road(px double precision, py double precision)
RETURNS double precision[] LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN abs(px-(5+round((px-5)/10)*10)) <= abs(py-(5+round((py-5)/10)*10))
  THEN ARRAY[5+round((px-5)/10)*10,py]
  ELSE ARRAY[px,5+round((py-5)/10)*10] END
$$;
UPDATE drivers SET x=(pg_temp.snap_road(x,y))[1],y=(pg_temp.snap_road(x,y))[2];
UPDATE orders SET
 pickup_x=(pg_temp.snap_road(pickup_x,pickup_y))[1],
 pickup_y=(pg_temp.snap_road(pickup_x,pickup_y))[2],
 dropoff_x=(pg_temp.snap_road(dropoff_x,dropoff_y))[1],
 dropoff_y=(pg_temp.snap_road(dropoff_x,dropoff_y))[2];
