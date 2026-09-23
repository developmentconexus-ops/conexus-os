#!/bin/bash
# Read-only census of the pilot's two clusters and the Applications storage.
set -uo pipefail
echo "== container"
docker inspect -f 'name={{.Name}} image={{.Config.Image}} restart={{.HostConfig.RestartPolicy.Name}} memory={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}} readonly={{.HostConfig.ReadonlyRootfs}} ports={{json .HostConfig.PortBindings}}' conexus-apps-postgres
docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} rw={{.RW}}{{"\n"}}{{end}}' conexus-apps-postgres
docker exec conexus-apps-postgres sh -c 'echo "memory.max=$(cat /sys/fs/cgroup/memory.max) cpu.max=$(cat /sys/fs/cgroup/cpu.max)"; ls /var/lib/postgresql/data/log; du -sh /var/lib/postgresql/data /var/lib/postgresql/data/pg_wal'
echo "== storage"
findmnt -n -o SOURCE,FSTYPE,OPTIONS /var/lib/conexus/applications-postgres
df -B1 --output=size,used,avail /var/lib/conexus/applications-postgres | tail -1
stat -c '%n size=%s allocated=%b*%B' /var/lib/conexus/applications-postgres.img /var/lib/conexus/q1-storage-probe.img
echo "== Applications cluster"
docker exec -i -u postgres conexus-apps-postgres psql -X -At -F ' | ' < "$HOME/q1c/apps-census.sql"
echo "== Hub cluster: application data left there"
docker exec conexus-s7-postgres psql -U postgres -At -F ' | ' -c "select datname from pg_database where datname = 'conexus_apps'" -c "select rolname from pg_roles where rolname ~ '^app_' order by 1" -c "select pg_postmaster_start_time()"
