import { downloadUrl } from './util.mjs';


export async function saveWeixinArticle(url, accountId, path, checksum) {
  // Todo:
  // replace http with https in the url
  // implement video link replacement

  const savedArticleLocation = `${path}/${accountId}/${checksum}.html`;
  if (fs.pathExistsSync(savedArticleLocation)) {
    console.log(`${savedArticleLocation} exists. Skip saving article.`);
    return;
  }

  let pageHtml = await downloadUrl(url, 3);
  
  pageHtml = await replaceCSSLinksWithLocalFiles(
    pageHtml,
    `${path}/styles`,
    '../styles');
  
  pageHtml = await replaceImgLinksWithLocalFiles(
    pageHtml,
    `${path}/${accountId}/${checksum}_files`,
    `./${checksum}_files`
    );
  
  pageHtml = sanitizeArticlePage(pageHtml);

  await fs.outputFileSync(`${path}/${accountId}/${checksum}.html`, pageHtml);
}


async function replaceCSSLinksWithLocalFiles(pageHtml, saveLocation, linkPath) {
  let updatedPageHtml = pageHtml;

  const cssLinks = pageHtml.match(/<link.*?rel="stylesheet".*?>/g);
  for (let i=0; i<cssLinks.length; i++) {
    const link = cssLinks[i];
    const url = link.replace(/^.*?href="/, 'https:')
      .replace(/".*$/, '')
      .replace(/https:https:/, 'https:');

    const fileName = url.substring(url.lastIndexOf('/')+1);
    if (!fs.pathExistsSync(`${saveLocation}/${fileName}`)) {
      await $`mkdir -p ${saveLocation} &&
        cd ${saveLocation} &&
        curl -sS -o ${fileName} ${url} -q`;
    }

    updatedPageHtml = updatedPageHtml
      .replace(link, `<link href="${linkPath}/${fileName}" rel="stylesheet">`);
  }
  
  return updatedPageHtml;
}


async function replaceImgLinksWithLocalFiles(pageHtml, saveLocation, linkPath) {
  let updatedPageHtml = pageHtml
    .replace(/<span class="js_img_placeholder wx_widget_placeholder".*?<\/span><\/span><\/span>/g, '');

  const imgLinks = pageHtml.match(/<img class="rich_pages.*?>/g);
  for (let i=0; i<imgLinks.length; i++) {
    const link = imgLinks[i];
    const url = link.replace(/^.*?data-src="/, '').replace(/".*>/, '');
    const fileFormat = url.substring(url.lastIndexOf('wx_fmt=')+7);
    const urlWithoutFormat = url.replace(url.substring(url.lastIndexOf('/')), '');
    const fileName = urlWithoutFormat
      .substring(urlWithoutFormat.lastIndexOf('/')+1) + '.' + fileFormat;
    await $`mkdir -p ${saveLocation} && 
      cd ${saveLocation} && 
      rm -f ${fileName} && 
      curl -sS -o ${fileName} ${url} -q`;

    updatedPageHtml = updatedPageHtml.replace(link, `<img src="${linkPath}/${fileName}">`);
  };

  return updatedPageHtml;
}


function sanitizeArticlePage(pageHtml) {
  let result = pageHtml
    .replace(/rich_media_area_extra"/g, `rich_media_area_extra" style="display:none"`);

  return result;
}