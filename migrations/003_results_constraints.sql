CREATE OR REPLACE FUNCTION enforce_results_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM results WHERE session_id = NEW.session_id) >= 50 THEN
    RAISE EXCEPTION 'Maximum of 50 results per session reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_results_limit
BEFORE INSERT ON results
FOR EACH ROW
EXECUTE FUNCTION enforce_results_limit();