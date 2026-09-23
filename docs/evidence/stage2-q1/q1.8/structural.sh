#!/bin/bash
# Q1.8 items 1 to 5, the settings and pg_stat_statements, read from the pilot. Read-only.
set -uo pipefail
hub=conexus-s7-postgres
apps=conexus-apps-postgres
hubsql() { docker exec "$hub" psql -X -U postgres -At -F ' | ' "$@"; }
appsql() { docker exec -u postgres "$apps" psql -X -At -F ' | ' "$@"; }

echo "== 1. two clusters, two containers"
for c in $hub $apps; do
  docker inspect -f 'container={{.Name}} id={{printf "%.12s" .Id}} image={{.Config.Image}} ports={{json .HostConfig.PortBindings}} memory={{.HostConfig.Memory}}' "$c"
  docker inspect -f '{{range .Mounts}}  mount {{.Type}} {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$c"
done
echo "hub   system identifier: $(hubsql -c 'select system_identifier from pg_control_system()')"
echo "apps  system identifier: $(appsql -c 'select system_identifier from pg_control_system()')"

echo "== 2. the Hub cluster holds no application database, schema or Project role"
hubsql -c "select 'databases', string_agg(datname, ',' order by datname) from pg_database"
hubsql -c "select 'app roles', count(*) from pg_roles where rolname ~ '^app_'"
for db in $(hubsql -c "select datname from pg_database where datallowconn"); do
  echo "application schemas in $db: $(docker exec "$hub" psql -X -U postgres -d "$db" -At -c "select count(*) from pg_namespace where nspname ~ '^p_[0-9a-f]{32}_preview\$'")"
done
echo "hub postmaster start: $(hubsql -c 'select pg_postmaster_start_time()')"

echo "== 3. everything the Applications cluster writes is on its fixed-size filesystem"
findmnt -n -o TARGET,SOURCE,FSTYPE,OPTIONS /var/lib/conexus/applications-postgres
stat -c 'image %n size=%s allocated=%b*%B' /var/lib/conexus/applications-postgres.img
df -B1 --output=source,size,used,avail /var/lib/conexus/applications-postgres | tail -1
appsql -c "select 'data_directory', setting from pg_settings where name = 'data_directory'" \
  -c "select 'log_directory', setting from pg_settings where name = 'log_directory'" \
  -c "select 'temp_tablespaces', coalesce(nullif(setting, ''), '(default: pg_default, inside data_directory)') from pg_settings where name = 'temp_tablespaces'" \
  -c "select 'tablespaces', string_agg(spcname || '=' || coalesce(nullif(pg_tablespace_location(oid), ''), 'data_directory'), ',') from pg_tablespace" \
  -c "select 'wal bytes', sum(size) from pg_ls_waldir()"
docker exec "$apps" sh -c 'cd /var/lib/postgresql/data && for p in . pg_wal log base; do echo "$p on $(df --output=source,size . | tail -1) $(stat -c %d $p)"; done; ls -la pg_wal | head -3; readlink pg_wal || echo "pg_wal is a directory, not a link"'
echo "host root device $(stat -c %d /) ; image filesystem device $(stat -c %d /var/lib/conexus/applications-postgres)"

echo "== 4. no filesystem, no container (a missing source is refused; see topology/storage-proof.txt)"
docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}pgdata mount type={{.Type}} source={{.Source}}{{end}}{{end}}' "$apps"

echo "== 5. memory limit"
docker inspect -f 'HostConfig.Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}} NanoCpus={{.HostConfig.NanoCpus}} PidsLimit={{.HostConfig.PidsLimit}} OomKillDisable={{.HostConfig.OomKillDisable}}' "$apps"
docker exec "$apps" sh -c 'echo "cgroup memory.max=$(cat /sys/fs/cgroup/memory.max) memory.swap.max=$(cat /sys/fs/cgroup/memory.swap.max) memory.current=$(cat /sys/fs/cgroup/memory.current)"'
docker info --format 'cgroup {{.CgroupVersion}} driver {{.CgroupDriver}}'
echo "host memory bytes $(free -b | awk '/^Mem:/ {print $2}') cpus $(nproc); Hub cluster container memory limit $(docker inspect -f '{{.HostConfig.Memory}}' "$hub") (0 = none)"
echo "host root filesystem (Hub cluster volume): $(df -B1 --output=source,size,avail / | tail -1)"

echo "== settings: cluster level"
appsql -c "select name, setting, coalesce(unit, ''), source, context from pg_settings where name in ('max_connections','reserved_connections','superuser_reserved_connections','statement_timeout','transaction_timeout','lock_timeout','idle_in_transaction_session_timeout','temp_file_limit','max_wal_size','min_wal_size','shared_buffers','work_mem','shared_preload_libraries','logging_collector','log_temp_files','log_lock_waits') order by name"
echo "== settings: role level, in conexus_apps, for one Project"
appsql -d conexus_apps -c "select r.rolname, r.rolconnlimit, array_to_string(s.setconfig, ', ') from pg_db_role_setting s join pg_roles r on r.oid = s.setrole join pg_database d on d.oid = s.setdatabase where d.datname = 'conexus_apps' and r.rolname like 'app_a700a0f2%' order by 1"
echo "== settings: who may set temp_file_limit"
appsql -c "select parname, paracl from pg_parameter_acl"

echo "== pg_stat_statements"
appsql -c "select 'extension', extversion from pg_extension where extname = 'pg_stat_statements'"
appsql -c "select 'statements tracked', count(*), 'calls', sum(calls) from pg_stat_statements"
appsql -c "select 'top by total time', r.rolname, s.calls, round(s.total_exec_time) || ' ms', left(regexp_replace(s.query, '\s+', ' ', 'g'), 60) from pg_stat_statements s join pg_roles r on r.oid = s.userid order by s.total_exec_time desc limit 5"
