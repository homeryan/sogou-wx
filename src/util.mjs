import * as dotenv from 'dotenv';
dotenv.config();
import 'zx/globals';
import defaults from '../defaults.json' assert { type: 'json' };

const PROXY_POOL = process.env.PROXY_POOL || defaults.PROXY_POOL;
const CONNECT_TIMEOUT = process.env.CONNECT_TIMEOUT || defaults.CONNECT_TIMEOUT;
const RETRY_COUNT = process.env.RETRY_COUNT || defaults.RETRY_COUNT;

let lastUsableProxy = null;

export async function fetchWebPageContent(url, cookies = []) {
  // let pageHtml = '';
  let pageHtml = await downloadWithOptionalProxy(url, null, cookies);
  if (pageHtml && pageHtml.length >= 500) {
    return pageHtml;
  } else {
    console.log('IP address has been banned by sogou.');
  }

  for (let i=0; i<RETRY_COUNT; i++) {
    lastUsableProxy && console.log(`Last usable proxy: ${lastUsableProxy}`);
    const proxy = lastUsableProxy || await getProxy();
    if (!proxy) {
      await $`echo 'Failed to get proxy.' && sleep 3`;
      continue;
    }

    pageHtml = await downloadWithOptionalProxy(url, proxy, cookies);
    if (pageHtml && pageHtml.length >= 500) {
      lastUsableProxy = proxy;
      break;
    } else {
      lastUsableProxy = null;
    }
  }

  return pageHtml;
}


async function getProxy() {
  let proxy = null; 

  try {
    const response = await fetch(PROXY_POOL);
    proxy = await response.text();
  } catch (error) {
    console.error(error)
  }
  
  if (!proxy.match(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+/)) {
    return null;
  }
  
  return proxy;
}


export async function downloadUrl(url, retry = RETRY_COUNT) {
  let content = null;

  for (let i=0; i<RETRY_COUNT; i++) {
    try {
      const response = await fetch(url);
      if (response.status !== 200) {
        throw(`Failed to fetch the article. Status code: ${response.status}`);
      }
      content = await response.text();
      break;
    } catch (error) {
      console.log(error);
      content = null;
    }
  }

  return content;
}


async function downloadWithOptionalProxy(url, proxy = null, cookies = []) {
  let curlArgs = ['-sS', '--max-time', CONNECT_TIMEOUT];
  if (cookies.length > 0) {
    cookies.forEach(cookie => {
      curlArgs.push('--cookie');
      curlArgs.push(cookie);
    });
  }
  if (proxy && proxy.length > 0) {
    curlArgs.push('-x');
    curlArgs.push(proxy);
  }
  curlArgs.push(url);

  let pageHtml = '';
  try {
    let response = await $`curl ${curlArgs}`;
    pageHtml = response._stdout || '';
    // Proxy worked, but sogou antispider has detected the fetch.
    if (pageHtml.indexOf('<title>302 Found</title>') >= 0 || 
      pageHtml.indexOf('weixin.sogou.com/antispider') >= 0 ||
      pageHtml.length < 500) {
      throw({ stderr: 'Detected by sogou antispider.' });
    }
  } catch (error) {
    pageHtml = null;
    console.log(`Error: ${error.stderr}`);
  }

  return pageHtml;
}


export function generateIndexHtml(path, subfolders) {
  let anchorElements = '';

  try {
    const htmlFiles = [];
    subfolders.forEach(subfolder => {
      if (fs.existsSync(`${path}/${subfolder}`)) {
        const filenames = fs.readdirSync(`${path}/${subfolder}`);
        filenames.filter(file => file.endsWith('.html'))
          .forEach(file => { htmlFiles.push(`./${subfolder}/${file}`) });
      } else {
        console.log(`${path}/${subfolder} does not exist.`);
      }
    });
    
    htmlFiles.forEach(file => {
      anchorElements += generateArticleLink(path, file);
    });
  } catch (error) {
    anchorElements = '';
    console.log(error);
  }
  
  const template = getIndexTemplate(path);
  const indexPage = template.replace(`id="wx_article_list">`, 
    `id="wx_article_list">${anchorElements}`);

  return indexPage;
}


function getIndexTemplate(path) {
  let template = '';
  try {
    template = fs.readFileSync(`${path}/template.html`, { encoding:'utf8', flag:'r' });
  } catch (error) {
    console.log(error);
  } finally {
    if (!template.match(/id="wx_article_list"/g)) {
      // Default template if templdate.html is not present.
      template = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css"
              rel="stylesheet"
              integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65"
              crossorigin="anonymous">
            <title>Articles</title>
            <style>a { display: inline; }</style>
          </head>
          <body>
            <div class="container-fluid px-0">
              <p><h2 align="center">Articles</h2></p>
              <div class="list-group list-group-flush" id="wx_article_list">
                <!-- <a href="LINK_OF_ARTICLE" class="list-group-item list-group-item-action">TITLE_OF_ARTICLE</a> -->
              </div>
              <p>&nbsp;</p>
            </div>
          </body>
        </html>
      `;
    };
  }
  
  return template;
}


function generateArticleLink(path, filename) {
  let anchorElement = '';

  try {
    const articleHtml = fs.readFileSync(`${path}/${filename}`, { encoding:'utf8', flag:'r' });
    const title = articleHtml.match(/<meta property="og:title" content="(.*?)"/)[1];
    const author = articleHtml.match(/<meta name="author" content="(.*?)"/)[1];
    const description = articleHtml.match(/<meta name="description" content="(.*?)"/)[1];
    anchorElement = `
      <a href="${filename}" class="list-group-item list-group-item-action">
        ${author} - ${title}<br>
        ${description}
      </a>
    `;
  } catch (error) {
    anchorElement = `
      <a href="${filename}" class="list-group-item list-group-item-action">
        ${filename}
      </a>
    `;
  }

  return anchorElement;
}