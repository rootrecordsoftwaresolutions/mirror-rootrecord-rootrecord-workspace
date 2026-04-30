# Publishing a release (maintainers)

1. Build and sign the Android artifact in your **private** repository.
2. On GitHub → **Releases** → **Draft a new release**, choose a tag (for example `v1.2.3`).
3. Attach the **APK** (and optional **README** / **CHANGELOG** excerpts as release description text).
4. Update [CHANGELOG.md](CHANGELOG.md) on `main` with a **`[x.y.z]`** section before you publish the tag so the default-branch log matches the release.
5. Bump `versionName` / `versionCode` in the private app’s `frontend/android/app/build.gradle` and `frontend/package.json`, then attach the new APK to the GitHub Release.

Do not upload keystores, `google-services.json`, Firebase JSON, or full source trees.
