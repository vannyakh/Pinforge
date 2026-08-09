import React from "react";

const AboutSettings: React.FC = () => (
  <div className="max-w-560px">
    <div className="text-22px font-600 text-t-primary mb-6px">About</div>
    <div className="text-t-secondary text-14px mb-24px">Pinforge local media downloader</div>

    <div className="bg-2 rd-12px border border-b-base p-18px text-14px text-t-secondary leading-relaxed">
      <p className="m-0 mb-12px">
        Downloads run on your machine. Image enhance uses sharp. YouTube uses a built-in JS
        extractor (optional Piped API). Instagram, TikTok, and Pinterest scrape Open Graph meta
        via fetch, with Playwright Chromium as a fallback for JS-rendered pages.
      </p>
      <p className="m-0">
        Personal / local use only. Respect each site’s terms and rate limits. Do not download
        private or copyrighted content you do not have rights to.
      </p>
    </div>
  </div>
);

export default AboutSettings;
