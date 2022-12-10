import * as dotenv from 'dotenv';
dotenv.config();
import 'zx/globals';
import { fetchWebPageContent, generateIndexHtml } from './src/util.mjs';
import { extractTitleChecksum, extractWxPubAccountArticleUrl } from './src/sogou-result.mjs';
import { saveWeixinArticle } from './src/weixin-article.mjs';
import defaults from './defaults.json' assert { type: 'json' };

const PUB_ACCOUNT = process.env.PUB_ACCOUNT || defaults.PUB_ACCOUNT;
const ARTICLE_SAVE_LOCATION = process.env.ARTICLE_SAVE_LOCATION || defaults.ARTICLE_SAVE_LOCATION;
const SOGOU_WX_QUERY_BASE = process.env.SOGOU_WX_QUERY_BASE || defaults.SOGOU_WX_QUERY_BASE;
const CHECK_INTERVAL = process.env.CHECK_INTERVAL || defaults.CHECK_INTERVAL;


const run = async () => {
  const accounts = fs.readJsonSync(PUB_ACCOUNT);

  // for (let i=1; i<accounts.length; i++) {
  for (let i=0; i<accounts.length; i++) {
    const sogouQueryUrl = SOGOU_WX_QUERY_BASE + accounts[i].wx_pub_account_id;
    const pageHtml = await fetchWebPageContent(sogouQueryUrl);
    if (!pageHtml) {
      continue;
    }

    const articleLinks = pageHtml.match(/<a.*?account_article_.*?<\/a>/g);
    if (!articleLinks || 
      !Array.isArray(articleLinks) ||
      articleLinks.length <= accounts[i].article_index ||
      !articleLinks[accounts[i].article_index]) {
      continue;
    }

    const anchorElement = articleLinks[accounts[i].article_index];
    const checksum = extractTitleChecksum(anchorElement);
    // If the latest article has been saved, skip the download.
    if (accounts[i].latest_article_md5 === checksum &&
      fs.existsSync(`${ARTICLE_SAVE_LOCATION}/${accounts[i].wx_pub_account_id}/${checksum}_files`)) {
      console.log('This article already exists.');
      continue;
    }
    
    const articleUrl = await extractWxPubAccountArticleUrl(anchorElement);
    if (!articleUrl) continue;
    await saveWeixinArticle(articleUrl, accounts[i].wx_pub_account_id, ARTICLE_SAVE_LOCATION, checksum);
    accounts[i].latest_article_md5 = extractTitleChecksum(anchorElement);
  }

  fs.writeJsonSync(PUB_ACCOUNT, accounts, { spaces: "  " });
  const articleListPage = generateIndexHtml(ARTICLE_SAVE_LOCATION, 
    accounts.map(account => account.wx_pub_account_id));
  fs.outputFileSync(`${ARTICLE_SAVE_LOCATION}/index.html`, articleListPage);
};


while (true) {
  await run();
  console.log(`Done at ${new Date()}`);
  await $`sleep ${CHECK_INTERVAL}`;
}