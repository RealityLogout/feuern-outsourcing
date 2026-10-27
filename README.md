# Feuern Outsourcing site, photo and file guide

All image paths are relative. Until a photo exists, the page shows a soft placeholder with the expected filename, so the site always looks finished.

## New photo slots (folder: images/)

| Filename | Where it shows | Suggested size |
|---|---|---|
| images/hero-desk.jpg | Home hero, "Your back office" card | 900 x 600 (3:2) |
| images/hero-field.jpg | Home hero, "Your crew" card | 900 x 600 (3:2) |
| images/about-team.jpg | About page, wide photo | 1600 x 900 (16:9) |
| images/about-portrait.jpg | About page, portrait | 1000 x 1250 (4:5) |
| images/guide-photos.jpg | Vendor guide, section 3 | 1600 x 900 (16:9) |
| images/og-cover.jpg | Social share image on every page | 1200 x 630 |

A temporary og-cover.jpg is included. Replace it with your own image using the same filename.

## Logo
The logo stays at the repo root as logo.png, because that is where the live site already loads it. Nothing needs to move.

## Blog photos (folder: img/, already uploaded)
These are used by blog-mortgage-field-services.html:
- img/blog-mfs-01-house-exterior.jpg
- img/blog-mfs-02-boarding-window.jpg
- img/blog-mfs-03-onboarding-documents.jpg
- img/blog-mfs-04-inspection.jpg
- img/blog-mfs-05-securing.jpg
- img/blog-mfs-06-lawn.jpg
- img/blog-mfs-07-winterization.jpg
- img/blog-mfs-08-debris.jpg
- img/blog-mfs-09-repairs.jpg
- img/blog-mfs-10-reopen-guide.jpg
- img/blog-mfs-11-bid-sample.jpg
- img/blog-mfs-12-backoffice.jpg

## Existing photos (folder: img/)
team-aminol.jpg, team-ismail.jpg, team-fazlea.jpg, workflow-infographic.png, svc-work-order-processing.png, svc-photo-document-review.png, svc-pcr.png, svc-bid-scope-writing.png, svc-photo-markup.png, svc-coordination.png, svc-letterhead-checklist.png, svc-portals-2x.png, cs-fridge.jpg, cs-outlet.jpg, cs-wall-patch.jpg, cs-foundation-vent.jpg, cs-stucco-crack.jpg, cs-eave-paint.jpg, cs-foundation-spall.jpg, cs-yard-debris.jpg, cs-loose-wire.jpg, cs-mailbox-debris.jpg, video-poster.jpg

Other files at the repo root: logo.png, feuern-overview.mp4, explainer-video.mp4, structural.jpg, propane.jpg, panel.jpg, workorder.jpg, tree.jpg, satellite.jpg, safeguard-portal.jpg, mcs-portal.jpg, and the bid-*.jpg photos.

## Search and AI files (repo root)
- sitemap.xml lists every page. Add new pages to it.
- robots.txt allows search engines and AI crawlers.
- llms.txt is a plain summary of the business for AI assistants. Keep prices and facts in it current.

## Folders
- resources/ holds the five printable checklists and templates.

## How to add a blog post (five minutes)

1. Copy `blog/template.html` and rename the copy, for example `blog/grass-cut-season.html`. Keep the new file inside the `blog` folder.
2. Open your copy. Search for each word in capitals and replace it: POST TITLE, POST DESCRIPTION, POST FILENAME, CATEGORY, YYYY-MM-DD, Month DD YYYY, PREVIOUS POST TITLE, NEXT POST TITLE. They appear in the page title, the share tags, the two script blocks near the top, and the page body.
3. Write your post between the CONTENT START and CONTENT END markers. Short sentences. Speak to "you". No dashes or hyphens in the visible text.
4. Add a cover photo named `img/blog-POST-FILENAME-cover.jpg` (use your real post name). Until it exists, a placeholder shows.
5. Add the post to `blogs.json`. Put the newest post first. Copy this and edit it, and keep the commas exact:

```
{
  "title": "Your post title",
  "excerpt": "One sentence that says what the post answers.",
  "file": "blog/grass-cut-season.html",
  "date": "2026-11-05",
  "category": "Portal and Process Guide"
}
```

6. Add the new page address to `sitemap.xml`, copying one of the existing blocks.
7. Update the Previous and Next links at the bottom of the new post and of the post before it.
8. Optional: add the post under "Key pages" in `llms.txt`.

The blog page and the home page teaser read `blogs.json` on their own. The three current posts are also written into the page, so search engines and AI tools can read them without running scripts.

## Do not
- Do not link to `blog/template.html`. It is blocked in `robots.txt` on purpose.
- Do not delete `blogs.json`. If it has a typo the blog list falls back to the posts already written into the page.
