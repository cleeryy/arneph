-- Storage policies for webtoon-images bucket
-- Allow anon role to upload, update, delete, and select objects

CREATE POLICY "Allow anon upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'webtoon-images');

CREATE POLICY "Allow anon update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'webtoon-images');

CREATE POLICY "Allow anon delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'webtoon-images');

CREATE POLICY "Allow anon select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'webtoon-images');
