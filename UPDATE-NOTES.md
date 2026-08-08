# Dashboard Life Premium Update

Adds live Life Insurance premium analytics to the Dashboard:
- Total Life Insurance Premium across all premium records visible to the logged-in user.
- Current-month Life Insurance premium based on policy effective date.
- January through December premium totals for the current year.
- Current-year total.
- Policies without an effective date remain in the all-time total and are called out separately.

The Dashboard is force-dynamic (`revalidate = 0`) so values are recalculated from Supabase whenever the page is loaded.

No database migration or Vercel environment-variable change is required.
