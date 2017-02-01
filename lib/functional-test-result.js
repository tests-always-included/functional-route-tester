"use strict";

/* eslint no-underscore-dangle:off */

var chalk, debug, HttpLinkHeader, lastId, nodeMocksHttp;

chalk = require("chalk");
debug = require("debug")("FunctionalTestResult");
HttpLinkHeader = require("http-link-header");
lastId = 0;
nodeMocksHttp = require("node-mocks-http");


/**
 * The FunctionalTest will create and use an instance of this object to
 * track the request and response, then to provide functionality to the
 * tests to make testing far easier.
 *
 * @class FunctionalTestResult
 * @property {*} body Pulled from the response, what should have been sent.
 * @property {Function} debug Write a debug message about this instance.
 * @property {FunctionalTest} functionalTest Reference back to the test.
 * @property {Object} headers Keyed by name, use .getHeader() instead.
 * @property {number} id A unique instance identifier number.
 * @property {HttpLinkHeader} links Parsed "Link" header.
 * @property {nodeMocksHttp~MockRequest} req
 * @property {nodeMocksHttp~mockRequestOptions} requestOptions
 * @property {nodeMocksHttp~MockResponse} res
 * @property {nodeMocksHttp~mockResponseOptions} responseOptions
 * @property {number} statusCode Numeric HTTP response code.
 * @property {string[]} toStringMethods Series to call via toString().
 * @property {string} uri URI from the request.
 */
class FunctionalTestResult {
    /**
     * Creates the result instance.
     *
     * @param {FunctionalTest} functionalTest Link back to test instance.
     * @param {nodeMocksHttp~mockRequestOptions} requestOptions
     * @param {nodeMocksHttp~mockResponseOptions} responseOptions
     */
    constructor(functionalTest, requestOptions, responseOptions) {
        // Per-instance values that can be set now
        lastId += 1;
        this.id = lastId;
        this.functionalTest = functionalTest;
        this.uri = requestOptions.url;
        this.debug = (message) => {
            debug(`#${this.id}: ${message}`);
        };
        this.debug("created");
        this.toStringMethods = [
            "toStringRequest",
            "toStringResponse",
            "toStringResponseLinks"
        ];

        // These are set after the response is returned via .finalize()
        this.body = null;
        this.statusCode = null;
        this.headers = {};
        this.links = null;

        // Request
        this.requestOptions = requestOptions;
        this.req = this.makeMockRequest(requestOptions);

        // Response
        responseOptions.req = this.req;
        this.responseOptions = responseOptions;
        this.res = this.makeMockResponse(responseOptions);
    }


    /**
     * Sets convenience properties after the request and response are done.
     */
    finalize() {
        var linkHeader;

        this.body = this.res._getData();
        this.statusCode = this.res._getStatusCode();

        // Convert to a number when possible
        if (+this.statusCode) {
            this.statusCode = +this.statusCode;
        }

        this.headers = this.res._getHeaders();
        linkHeader = this.getHeader("Link");

        if (linkHeader) {
            this.links = this.parseLinks(linkHeader);
        }
    }


    /**
     * Finds a link in the Link header.
     *
     * @param {string} rel
     * @param {string} [title]
     * @return {(Object|Error)} Link definition or error message
     */
    findLink(rel, title) {
        var linkArray, suffix;

        if (!this.links) {
            return new Error("No links were in the response");
        }

        linkArray = this.links.rel(rel);
        suffix = ` for relation ${rel}`;

        if (!linkArray || !linkArray.length) {
            return new Error(`No links found ${suffix}`);
        }

        if (title) {
            linkArray = linkArray.filter((item) => {
                return item.title === title;
            });
            suffix += `, title ${title}`;
        }

        if (linkArray.length > 1) {
            return new Error(`Multiple links found ${suffix}`);
        }

        if (linkArray.length < 1) {
            return new Error(`No links exist ${suffix}`);
        }

        return linkArray[0];
    }


    /**
     * Async version of findLink() that simply returns a promise and will
     * reject the promise when an Error is returned.
     *
     * @param {string} rel
     * @param {string} [title]
     * @return {Promise.<(Object|Error)>} Link definition or error message
     */
    findLinkAsync(rel, title) {
        var result;

        result = this.findLink(rel, title);

        if (result instanceof Error) {
            return Promise.reject(result);
        }

        return Promise.resolve(result);
    }


    /**
     * Searches for a given link.  If found, this follows the link and the
     * promise will be resolved with the new result.
     *
     * @param {string} method
     * @param {string} rel
     * @param {string} [title]
     * @param {nodeMocksHttp~mockRequestOptions} [options]
     * @return {Promise.<FunctionalTestResult>}
     */
    followAsync(method, rel, title, options) {
        if (typeof title === "object") {
            options = title;
            title = null;
        }

        if (!options) {
            options = {};
        }

        return this.findLinkAsync(rel, title).then((linkDefinition) => {
            return this.functionalTest.requestAsync(method, linkDefinition.url, options);
        });
    }


    /**
     * Returns a response header.
     *
     * @param {string} headerName
     * @return {(string|null)} Header's value
     */
    getHeader(headerName) {
        return this.functionalTest.getHeader(this.res._getHeaders(), headerName);
    }


    /**
     * Create a mock request object.
     *
     * @param {nodeMocksHttp~mockRequestOptions} options
     * @return {nodeMocksHttp~mockRequest}
     */
    makeMockRequest(options) {
        var req;

        req = nodeMocksHttp.createRequest(options);

        // The mock does not have a resume() function.  Simulate it.
        req.resume = () => {
            this.debug("resume() called");
        };

        // Do this asynchronously.
        setTimeout(() => {
            if (this.requestOptions.body) {
                this.debug("sending body");
                req.emit("data", options.body);
            } else {
                this.debug("no body to send");
            }

            req.emit("end");
        });

        return req;
    }


    /**
     * Create the mock response object.
     *
     * @param {nodeMocksHttp~mockResponseOptions} options
     * @return {nodeMocksHttp~mockResponse}
     */
    makeMockResponse(options) {
        var res;

        res = nodeMocksHttp.createResponse(options);

        return res;
    }


    /**
     * Reformat the Links header for easier lookup and processing.
     *
     * @param {string} linkHeader
     * @return {(Object|null)}
     */
    parseLinks(linkHeader) {
        return HttpLinkHeader.parse(linkHeader);
    }


    /**
     * Issue a request.  This should only be called by the FunctionalTest.
     *
     * @param {Function} requestHandler
     * @return {Promise.<this>}
     */
    requestAsync(requestHandler) {
        this.requestTimeStart = new Date();

        return new Promise((resolve, reject) => {
            var theTimeout;

            this.res.on("end", () => {
                this.debug("end event emitted");

                if (theTimeout) {
                    // Do not finalize if the timeout expired already.
                    this.finalize();
                    clearTimeout(theTimeout);
                }

                resolve(this);
            });

            // Requests that do not finish quickly will reject the promise.
            theTimeout = setTimeout(() => {
                this.debug("timed out");
                reject(new Error("Request timed out"));
                theTimeout = null;
            }, this.requestOptions.timeoutMs);

            // Issue the request to the router
            this.debug("calling request handler");
            requestHandler(this.req, this.res, () => {
                // Normally the "done" callback is not called by createServer.
                this.debug("a 'done' callback was called");
            });
        });
    }


    /**
     * Converts the object into something more readable.
     *
     * You can modify this behavior by adding additional functions to the
     * instance and then changing the list of functions to execute.
     * That list is stored as this.toStringMethods.
     *
     * Each of the toStringMethods needs to return `null` to signify that
     * the section should be skipped, an array of strings to join with
     * newlines, or a single string.
     *
     * @param {boolean} [colorize=true]
     * @return {string}
     */
    toString(colorize = true) {
        var result;

        result = [];
        this.toStringMethods.forEach((methodName) => {
            var header, name, toStringValue;

            name = methodName.replace(/^toString/, "").replace(/([^A-Z])[A-Z]/, (match) => {
                return `${match[0]} ${match[1]}`;
            });
            toStringValue = this[methodName](colorize);

            if (toStringValue !== null) {
                header = `----- ${name} #${this.id} -----`;

                if (colorize) {
                    header = chalk.blue(header);
                }

                result.push(header);
                result = result.concat(toStringValue);
            }
        });

        return result.join("\n");
    }


    /**
     * Convert the request into a useful string
     *
     * @param {boolean} colorize
     * @return {string}
     */
    toStringRequest(colorize) {
        var body, result;

        result = [];
        result.push(chalk.yellow(`${this.requestOptions.method} ${this.requestOptions.url}`));
        Object.keys(this.requestOptions.headers).forEach((key) => {
            result.push(`${key}: ${this.requestOptions.headers[key]}`);
        });
        result.push("");
        body = this.requestOptions.body;

        if (body) {
            body = body.toString("utf8");

            if (colorize) {
                body = chalk.gray(body);
            }

            result.push(body);
        }

        return result;
    }


    /**
     * Convert the response into a useful string.
     *
     * @param {boolean} colorize
     * @return {string}
     */
    toStringResponse(colorize) {
        var body, result, statusLine;

        result = [];
        statusLine = `${this.res.statusCode} ${this.res.statusMessage}`;

        if (colorize) {
            statusLine = chalk.yellow(statusLine);
        }

        result.push(statusLine);
        Object.keys(this.headers).forEach((key) => {
            result.push(`${key}: ${this.headers[key]}`);
        });
        result.push("");

        if (this.body) {
            body = this.body.toString("utf8");

            if (colorize) {
                body = chalk.gray(body);
            }

            result.push(body);
        }

        return result;
    }


    /**
     * If links are found, convert them into an easy string to read.
     *
     * @param {boolean} colorize
     * @return {string}
     */
    toStringResponseLinks(colorize) {
        var result;

        result = [];

        if (!this.links) {
            return null;
        }

        this.links.refs.forEach((ldo) => {
            var link, linkStr, str;

            link = new HttpLinkHeader();
            link.set(ldo);
            linkStr = link.toString().replace(/%2F/g, "/");

            if (colorize) {
                str = `${chalk.yellow(ldo.rel)}: ${linkStr}`;
            } else {
                str = `${ldo.rel}: ${linkStr}`;
            }

            result.push(str);
        });

        return result;
    }
}

module.exports = FunctionalTestResult;
