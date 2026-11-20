# Kundar Travel

A cinematic stays-booking front end for places in **Lagos, Abuja, Ibadan and Port Harcourt**. Based in Lagos and Abuja.

- Three-slide hero with a soft, misty right-to-left wipe between slides, giant frosted titles and drifting clouds (generated in code on a canvas and screen-blended)
- Round destination thumbnails on concentric rings, with an animated caption
- Search bar with a working date-range calendar, a guest picker and a city picker
- "Recommended Places to Stay" grid (8 stays, prices in ₦)
- Card → detail page shared-element flight, with a booking card (dates carried over from the search, guest stepper, nightly total)
- Fully responsive, with no horizontal scroll; custom cursor on desktop (add `?rec` to the URL for a larger cursor when screen-recording)

Plain HTML, CSS and JavaScript. No build step.

## Run locally

```bash
python3 -m http.server 5180
```

Then open http://localhost:5180.

## Deploy (Netlify)

Push this repo to GitHub, then in Netlify choose **Add new site → Import an existing project**, pick the repo, leave the build command empty and set the publish directory to `/`.

## Files

```
index.html   markup
styles.css   all styles
app.js       slides, clouds, rail, search popovers, cards, detail page
img/         all photos, hosted locally
```

## Photo credits

All photos are downloaded into `img/`; nothing is hotlinked.

Photos from [Pexels](https://www.pexels.com) are used under the [Pexels License](https://www.pexels.com/license/) (free to use; attribution is not required but is given here).

| File | Subject | Photographer | Source |
|---|---|---|---|
| slide-lagos.jpg | Lagos skyline at sunset, from the lagoon | FERA | [Pexels 36602313](https://www.pexels.com/photo/36602313/) |
| slide-stay.jpg | Balcony overlooking Lagos | Ben Iwara | [Pexels 40845383](https://www.pexels.com/photo/40845383/) |
| slide-abuja.jpg | National Mosque, Abuja | Sadiq Ali | [Pexels 28375230](https://www.pexels.com/photo/28375230/) |
| thumb-lekki-bridge.jpg | Lekki–Ikoyi Link Bridge at night | Olasunkanmiariyo | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lekki_link_bridge_at_night.jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| thumb-elegushi.jpg | Elegushi Beach coastline, Lagos | Ben Iwara | [Pexels 27857461](https://www.pexels.com/photo/27857461/) |
| thumb-zuma.jpg | Zuma Rock, near Abuja | Mukhtar Shuaib Mukhtar | [Pexels 36814806](https://www.pexels.com/photo/36814806/) |
| stay-1-*.jpg | Lekki Pool Terrace | Isaac Udoye | [Pexels 16791339](https://www.pexels.com/photo/16791339/) |
| stay-2-*.jpg | Ikoyi Lagoon Suite | Ben Iwara | [Pexels 40845384](https://www.pexels.com/photo/40845384/) |
| stay-3-*.jpg | Maitama Garden House | Taiye Salawu | [Pexels 38040969](https://www.pexels.com/photo/38040969/) |
| stay-4-*.jpg | Wuse Palm Court | yahaya ahmed | [Pexels 34432716](https://www.pexels.com/photo/34432716/) |
| stay-5-*.jpg | Asokoro Warm Loft | Mukhtar Shuaib Mukhtar | [Pexels 39854861](https://www.pexels.com/photo/39854861/) |
| stay-6-*.jpg | Bodija Reading Flat | Jagaba Denis | [Pexels 34631660](https://www.pexels.com/photo/34631660/) |
| stay-7-*.jpg | GRA Garden Duplex (a living room in Nigeria; not photographed in Port Harcourt) | Hammad Dikko | [Pexels 20019416](https://www.pexels.com/photo/20019416/) |
| stay-8-*.jpg | Victoria Island Sky Flat | Ebenezer Idowu | [Pexels 20430716](https://www.pexels.com/photo/20430716/) |
| interior-1.jpg | Living room and kitchen, Abuja | Mukhtar Shuaib Mukhtar | [Pexels 39854853](https://www.pexels.com/photo/39854853/) |
| interior-2.jpg | Bedroom | Taiye Salawu | [Pexels 36482935](https://www.pexels.com/photo/36482935/) |
| interior-3.jpg | Interior with wall art | Caio Mantovani | [Pexels 17905814](https://www.pexels.com/photo/17905814/) |
| avatar-1.jpg | Host portrait | Pexels contributor | [Pexels 39462600](https://www.pexels.com/photo/39462600/) |
| avatar-2.jpg | Reviewer portrait | Pexels contributor | [Pexels 3316263](https://www.pexels.com/photo/3316263/) |
| avatar-3.jpg | Reviewer portrait | Pexels contributor | [Pexels 36322505](https://www.pexels.com/photo/36322505/) |
| avatar-4.jpg | Reviewer portrait | Pexels contributor | [Pexels 21222664](https://www.pexels.com/photo/21222664/) |

The listings, host and reviews are fictional demo content. The clouds are generated procedurally in `app.js`, so no cloud photo is used.
