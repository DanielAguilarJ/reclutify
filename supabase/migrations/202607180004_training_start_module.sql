BEGIN;

CREATE OR REPLACE FUNCTION public.start_training_module(
  p_employee_id UUID,
  p_module_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee public.training_employees%ROWTYPE;
  v_module public.training_modules%ROWTYPE;
  v_progress public.training_progress%ROWTYPE;
BEGIN
  SELECT *
  INTO v_employee
  FROM public.training_employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_employee_not_found';
  END IF;

  SELECT *
  INTO v_module
  FROM public.training_modules
  WHERE id = p_module_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_module_not_found';
  END IF;

  IF v_module.program_id <> v_employee.program_id THEN
    RAISE EXCEPTION 'module_not_assigned';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.training_progress
  WHERE employee_id = p_employee_id
    AND module_id = p_module_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_progress_not_found';
  END IF;

  IF v_progress.status = 'locked' THEN
    RAISE EXCEPTION 'module_locked';
  END IF;

  IF v_progress.status = 'available' THEN
    UPDATE public.training_progress
    SET
      status = 'in_progress',
      started_at = COALESCE(started_at, now())
    WHERE id = v_progress.id;
  ELSIF v_progress.status NOT IN (
    'in_progress',
    'completed'
  ) THEN
    RAISE EXCEPTION 'module_not_available';
  END IF;

  IF v_employee.status = 'not_started' THEN
    UPDATE public.training_employees
    SET
      status = 'active',
      started_at = COALESCE(started_at, now())
    WHERE id = p_employee_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status',
    CASE
      WHEN v_progress.status = 'available'
        THEN 'in_progress'
      ELSE v_progress.status
    END
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.start_training_module(UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.start_training_module(UUID, UUID)
TO service_role;

COMMIT;
