import { queryMany } from "@/lib/dfm/db/client";

export interface StaleClickupDealRow {
  ae_name: string;
  business_name: string;
  clickup_task_id: string;
  clickup_task_url: string | null;
  delivered_at: Date | string | null;
  last_touched_at: Date | string | null;
  days_stale: string | number;
  total_count: string | number;
}

export interface StaleAirtableDealRow {
  airtable_record_id: string;
  business_name: string;
  listing_url: string | null;
  source_created_at: Date | string | null;
  source_updated_at: Date | string | null;
  last_touched_at: Date | string | null;
  days_stale: string | number;
  total_count: string | number;
}

export async function listStaleClickupDeals(days: number, limit: number) {
  return queryMany<StaleClickupDealRow>(
    `
      with latest_deliveries as (
        select
          j.deal_id,
          j.ae_thesis_id,
          max(coalesce(r.created_at, j.sent_at, j.updated_at, j.created_at)) as last_touched_at,
          max(j.sent_at) as delivered_at
        from dfm_private.clickup_delivery_jobs j
        join dfm_private.clickup_delivery_receipts r on r.job_id = j.id
        where j.status = 'sent'
        group by j.deal_id, j.ae_thesis_id
      ),
      latest_receipts as (
        select distinct on (j.deal_id, j.ae_thesis_id)
          j.deal_id,
          j.ae_thesis_id,
          r.clickup_task_id,
          r.clickup_task_url
        from dfm_private.clickup_delivery_jobs j
        join dfm_private.clickup_delivery_receipts r on r.job_id = j.id
        where j.status = 'sent'
        order by j.deal_id, j.ae_thesis_id, r.created_at desc
      )
      select
        ae.ae_name,
        d.business_name,
        lr.clickup_task_id,
        lr.clickup_task_url,
        ld.delivered_at,
        ld.last_touched_at,
        floor(extract(epoch from (now() - ld.last_touched_at)) / 86400)::int as days_stale,
        count(*) over()::int as total_count
      from latest_deliveries ld
      join latest_receipts lr
        on lr.deal_id = ld.deal_id
       and lr.ae_thesis_id = ld.ae_thesis_id
      join dfm_public.ae_theses ae on ae.id = ld.ae_thesis_id
      join dfm_public.deals_normalized d on d.id = ld.deal_id
      where ld.last_touched_at < now() - make_interval(days => $1::int)
      order by ld.last_touched_at asc
      limit $2
    `,
    [days, limit],
  );
}

export async function listStaleAirtableDeals(days: number, limit: number) {
  return queryMany<StaleAirtableDealRow>(
    `
      select
        d.airtable_record_id,
        d.business_name,
        d.listing_url,
        d.source_created_at,
        d.source_updated_at,
        greatest(
          coalesce(d.source_updated_at, d.source_created_at, d.updated_at, d.created_at),
          coalesce(d.updated_at, d.created_at)
        ) as last_touched_at,
        floor(
          extract(
            epoch from (
              now() - greatest(
                coalesce(d.source_updated_at, d.source_created_at, d.updated_at, d.created_at),
                coalesce(d.updated_at, d.created_at)
              )
            )
          ) / 86400
        )::int as days_stale,
        count(*) over()::int as total_count
      from dfm_public.deals_normalized d
      where d.is_active = true
        and greatest(
          coalesce(d.source_updated_at, d.source_created_at, d.updated_at, d.created_at),
          coalesce(d.updated_at, d.created_at)
        ) < now() - make_interval(days => $1::int)
      order by last_touched_at asc
      limit $2
    `,
    [days, limit],
  );
}
