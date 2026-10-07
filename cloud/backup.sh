#!/bin/bash
# Daily backup of the LabPOS cloud: Postgres dump (kept 14 days) + weekly archive of the report PDFs (kept 4 weeks).
# Cron: 30 21 * * *  /opt/labpos-cloud/backup.sh      (21:30 UTC = 02:30 Pakistan time)
# Restore:  gunzip -c backups/auto/db-<stamp>.sql.gz | docker compose exec -T db psql -U labpos -d <empty database>
export PATH=/usr/local/bin:/usr/bin:/bin
set -e
cd /opt/labpos-cloud
set -a; . ./.env; set +a
D=backups/auto; mkdir -p $D
STAMP=$(date +%Y%m%d-%H%M)
docker compose exec -T db sh -c "pg_dump -U ${POSTGRES_USER:-labpos} ${POSTGRES_DB:-labpos}" | gzip > $D/db-$STAMP.sql.gz.tmp
gunzip -t $D/db-$STAMP.sql.gz.tmp
SZ=$(stat -c %s $D/db-$STAMP.sql.gz.tmp)
if [ "$SZ" -lt 20000 ]; then echo "$(date -Is) FAILED: dump too small ($SZ bytes)"; rm -f $D/db-$STAMP.sql.gz.tmp; exit 1; fi
mv $D/db-$STAMP.sql.gz.tmp $D/db-$STAMP.sql.gz
if [ "$(date +%u)" = 7 ] && [ -d report-pdfs ]; then tar -czf $D/pdfs-$STAMP.tar.gz report-pdfs; fi
ls -1t $D/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t $D/pdfs-*.tar.gz 2>/dev/null | tail -n +5 | xargs -r rm -f
echo "$(date -Is) ok db-$STAMP.sql.gz $SZ bytes"
