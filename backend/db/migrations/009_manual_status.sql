-- Expand execution status options for manual testing
ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE executions ADD CONSTRAINT executions_status_check
  CHECK (status IN ('Running','Passed','Failed','Blocked','Error','N/A','In-Progress','Not Run'));
