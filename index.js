/*
CORS Anywhere as a Cloudflare Worker!
(c) 2019 by Zibri (www.zibri.org)
email: zibri AT zibri DOT org
https://github.com/Zibri/cloudflare-cors-anywhere
*/

addEventListener("fetch", async event => {
    event.respondWith((async () => handler(event))());
});

function handler(event) {
    const origin_url = new URL(event.request.url);
    const origin = event.request.headers.get("Origin");
    const fetch_url = unescape(unescape(origin_url.search.substr(1)));
    const isAllowedRequest = (!isListed(fetch_url, blacklist)) && (isListed(origin, whitelist));
    if (!isAllowedRequest) {
        return printForbiddenResponse();
    }
    if (fetch_url === "") {
        return printIncorrectRequestFormat(event);
    }
    return doRequest(event)
}

/*
whitelist = [ "^http.?://www.zibri.org$", "zibri.org$", "test\\..*" ];  // regexp for whitelisted urls
*/

blacklist = [];         // regexp for blacklisted urls
whitelist = [".*"];     // regexp for whitelisted origins

function isListed(uri, listing) {
    let ret = false;
    if (typeof uri == "string") {
        listing.forEach((m) => {
            if (uri.match(m) != null) ret = true;
        });
    } else {           // decide what to do when Origin is null
        ret = true;    // true accepts null origins false rejects them.
    }
    return ret;
}

function fix(myHeaders, event) {
    const origin = event.request.headers.get("Origin");
    myHeaders.set("Access-Control-Allow-Origin", origin);
    const isOPTIONS = event.request.method === "OPTIONS";
    if (isOPTIONS) {
        myHeaders.set("Access-Control-Allow-Methods", event.request.headers.get("access-control-request-method"));
        const accessControl = event.request.headers.get("access-control-request-headers");
        if (accessControl) {
            myHeaders.set("Access-Control-Allow-Headers", accessControl);
        }
        myHeaders.delete("X-Content-Type-Options");
    }
    return myHeaders;
}


function printForbiddenResponse() {
    return new Response(`Create your own cors proxy</br>
<a href='https://github.com/Zibri/cloudflare-cors-anywhere'>https://github.com/Zibri/cloudflare-cors-anywhere</a>`,
        {
            status: 403,
            statusText: 'Forbidden',
            headers: {
                "Content-Type": "text/html"
            }
        });
}

function printIncorrectRequestFormat(event) {
    const clientIP = event.request.headers.get("CF-Connecting-IP") || undefined;
    const origin_url = new URL(event.request.url);
    const origin = event.request.headers.get("Origin") || undefined;
    let myHeaders = new Headers();
    myHeaders = fix(myHeaders, event);

    const cfData = event.request.cf;
    const country = cfData && cfData.country || undefined;
    const dataCenter = cfData && cfData.colo || undefined;

    return new Response(`CLOUDFLARE-CORS-ANYWHERE

Source: https://github.com/Zibri/cloudflare-cors-anywhere
Usage:  ${origin_url.origin}/?uri

Limits: 100,000 requests/day
        1,000 requests/10 minutes

` +
        (clientIP ? `IP: ${clientIP}\n` : "") +
        (origin ? `Origin: ${origin}\n` : "") +
        (country ? `Country: ${country}\n` : "") +
        (dataCenter ? `Datacenter: ${dataCenter}\n` : ""),
        {status: 200, headers: myHeaders}
    );
}


async function doRequest(event) {
    const isOPTIONS = event.request.method === "OPTIONS";
    const origin_url = new URL(event.request.url);
    const fetch_url = unescape(unescape(origin_url.search.substr(1)));
    const recv_headers = {};
    for (const [key, value] of event.request.headers.entries()) {
        if ((key.match("^origin") == null) &&
            (key.match("eferer") == null) &&
            (key.match("^cf-") == null) &&
            (key.match("^x-forw") == null) &&
            (key.match("^x-cors-headers") == null)) {
            recv_headers[key] = value;
        }
    }

    let xHeaders = event.request.headers.get("x-cors-headers");
    if (xHeaders != null) {
        try {
            xHeaders = JSON.parse(xHeaders);
        } catch (e) {
        }
    }

    if (xHeaders != null) {
        Object.entries(xHeaders).forEach(([key, value]) => recv_headers[key] = value);
    }

    const newRequest = new Request(event.request, {headers: recv_headers});

    let response = await fetch(fetch_url, newRequest);
    const redirectUrl = response.headers.get("location") || "";
    if (redirectUrl && !isOPTIONS) {
        response = await fetch(redirectUrl, newRequest);
    }
    let myHeaders = new Headers(response.headers);
    const allHeaderNames = {};
    for (const [key, value] of response.headers.entries()) {
        allHeaderNames[key] = value;
    }
    const cors_headers = Object.keys(allHeaderNames);
    cors_headers.push("cors-received-headers");
    myHeaders = fix(myHeaders, event);

    myHeaders.set("Access-Control-Expose-Headers", cors_headers.join(","));
    myHeaders.set("cors-received-headers", JSON.stringify(allHeaderNames));

    const init = {
        headers: myHeaders,
        status: isOPTIONS ? 200 : response.status,
        statusText: isOPTIONS ? "OK" : response.statusText
    };
    const body = isOPTIONS ? null : await response.arrayBuffer();
    return new Response(body, init);
}
