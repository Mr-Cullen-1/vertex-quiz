-- Vertex Quiz — Storage bucket for source PDFs (Phase 4)
--
-- No application table/column changes here — quizzes.source_pdf_path
-- already exists (added in Phase 1) for exactly this purpose. This
-- migration only configures Supabase Storage: a private bucket plus RLS
-- policies on storage.objects, mirroring the ownership model already used
-- for public.quizzes.
--
-- Path convention: `{teacher_id}/{quiz_id}.pdf` — one source PDF per quiz,
-- re-uploading overwrites it (upsert). Policies check that the first path
-- segment (`storage.foldername(name)[1]`) equals the caller's own
-- `auth.uid()`, so a teacher can only reach objects under their own
-- folder. Nothing here relies on a signed/public URL — every access goes
-- through the authenticated server client (src/lib/supabase/server.ts) so
-- the object is only ever readable by its owning teacher's own session.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quiz-pdfs',
  'quiz-pdfs',
  false, -- private: never reachable via a public URL
  8388608, -- 8 MB — see src/lib/quizzes/pdf.ts for the matching app-level limit
  array['application/pdf']
)
on conflict (id) do nothing;

create policy "quiz_pdfs_select_own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'quiz-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "quiz_pdfs_insert_own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'quiz-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "quiz_pdfs_update_own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'quiz-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'quiz-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "quiz_pdfs_delete_own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'quiz-pdfs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
