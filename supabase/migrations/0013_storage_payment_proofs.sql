-- ─────────────────────────────────────────────────────────
-- 0013  The payment-proofs storage bucket
-- BUILD-SPEC section 7.3, final paragraph, and 10.1
--
-- Objects are stored at payment-proofs/{user_id}/{booking_id}.jpg. A player may
-- put a file under his own user id and nowhere else. Only staff may read one.
-- Nobody may update or delete: the purge job (section 8.6) runs with the
-- service role, which bypasses RLS entirely and therefore needs no policy.
-- ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY payment_proofs_insert_own_folder ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY payment_proofs_select_staff ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND is_staff()
  );
