import { queryMany } from "@/lib/dfm/db/client";

export type AeCoverageReviewRow = {
  ae_thesis_id: string;
  delivered_last_7_days: string | number;
  delivered_last_30_days: string | number;
  active_strong_candidates: string | number;
  active_moderate_candidates: string | number;
};

export async function listAeCoverageReviewRows() {
  return queryMany<AeCoverageReviewRow>(
    `
      with recent_deliveries as (
        select
          ae_thesis_id,
          count(*) filter (
            where status = 'sent'
              and sent_at >= now() - interval '7 days'
          )::int as delivered_last_7_days,
          count(*) filter (
            where status = 'sent'
              and sent_at >= now() - interval '30 days'
          )::int as delivered_last_30_days
        from dfm_private.clickup_delivery_jobs
        group by ae_thesis_id
      ),
      active_candidates as (
        select
          c.ae_thesis_id,
          count(*) filter (
            where d.is_active = true
              and c.match_quality = 'Strong'
          )::int as active_strong_candidates,
          count(*) filter (
            where d.is_active = true
              and c.match_quality = 'Moderate'
          )::int as active_moderate_candidates
        from dfm_private.match_candidates c
        join dfm_public.deals_normalized d on d.id = c.deal_id
        group by c.ae_thesis_id
      )
      select
        ae.id as ae_thesis_id,
        coalesce(rd.delivered_last_7_days, 0)::int as delivered_last_7_days,
        coalesce(rd.delivered_last_30_days, 0)::int as delivered_last_30_days,
        coalesce(ac.active_strong_candidates, 0)::int as active_strong_candidates,
        coalesce(ac.active_moderate_candidates, 0)::int as active_moderate_candidates
      from dfm_public.ae_theses ae
      left join recent_deliveries rd on rd.ae_thesis_id = ae.id
      left join active_candidates ac on ac.ae_thesis_id = ae.id
      where ae.status = 'active'
      order by ae.ae_name asc
    `,
  );
}
