-- =============================================================================
-- Contratos para cualquier persona de la plantilla
--
-- contracts.employee_id apuntaba a users (cuentas de la app): los pickers sin
-- cuenta (la mayoría) no podían tener contrato. La plantilla es la lista única
-- de pickers (pickers, team leaders, runners); el personal de oficina solo
-- tiene cuenta (users). Un contrato vale para cualquiera de las dos.
-- =============================================================================

DO $$
DECLARE c record;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.conrelid = 'public.contracts'::regclass
          AND con.contype = 'f'
          AND att.attname = 'employee_id'
    LOOP
        EXECUTE format('ALTER TABLE public.contracts DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_contract_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.pickers WHERE id = NEW.employee_id)
       AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.employee_id) THEN
        RAISE EXCEPTION 'CONTRACT_EMPLOYEE_NOT_FOUND: % is not in the staff list', NEW.employee_id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_contract_employee ON public.contracts;
CREATE TRIGGER trg_check_contract_employee
    BEFORE INSERT OR UPDATE OF employee_id ON public.contracts
    FOR EACH ROW EXECUTE FUNCTION public.check_contract_employee();

COMMENT ON COLUMN public.contracts.employee_id IS
  'Persona de la plantilla (pickers.id) o de oficina (users.id). Se valida con trg_check_contract_employee.';

-- Nómina necesita la tarifa por hora de los contratos (mínimo garantizado de
-- cada persona) de toda la empresa, igual que RRHH.
DROP POLICY IF EXISTS "Payroll reads company contracts" ON public.contracts;
CREATE POLICY "Payroll reads company contracts" ON public.contracts
    FOR SELECT USING (public.can_read_company_payroll());
