export const retiredRoles = 'GRANT hub_reader, hub_command, iam_rls TO hub_builder_ingress'
export const switches = 'SET ROLE a; set local   role b; SET SESSION ROLE c; RESET ROLE'
export const helper = 'SELECT rls.acting_account()'
export const settings = "SELECT set_config('conexus.account_id', 'x', true), current_setting('conexus.job')"
