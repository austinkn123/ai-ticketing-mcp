CREATE INDEX tickets_available_order ON tickets(project_id,priority,created_at,id)
WHERE status IN ('ready','in_progress');
