"use strict";

/* eslint no-underscore-dangle:off, no-invalid-this:off */

var chalk, debug, EventEmitter, http, HttpLinkHeader, lastId, nodeMocksHttp;

chalk = require("chalk");
debug = require("debug")("FunctionalTestResult");
EventEmitter = require("events").EventEmitter;
http = require("http");
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

        // These are set after the response is returned via .finalize().
        this.body = null;
        this.statusCode = null;
        this.headers = {};
        this.links = null;

        // Create the request object.
        this.requestOptions = requestOptions;
        this.req = this.makeMockRequest(requestOptions);

        // Create the response object.
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
     * @return {(Object|Error)} Link definition or error message.
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
     * @return {Promise.<(Object|Error)>} Link definition or error message.
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
     * @return {(string|null)} Header's value.
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
        var req, sent;

        // If restify, use http.IncomingMessage as the event emitter because
        // restify uses that object directly and adds extra functions to
        // the prototype.
        // If restiq.mw.readBody is used to read the body and readBinary option
        // is set to false or undefined it will attempt to
        // call `req.setEncoding("utf8")` which is a function
        // http.IncomingMessage implements from the Readable Stream interface.
        if (this.functionalTest.serverType === "restify" || this.functionalTest.serverType === "restiq") {
            options.eventEmitter = http.IncomingMessage;
        }

        req = nodeMocksHttp.createRequest(options);

        // If Restify, the framework adds path() to the prototype of
        // http.IncomingMessage. Unfortunately, it is overshadowed by the mock.
        // Luckily, deleting the method will fallback on the prototype's
        // method (Restify's) and won't break the mock.
        if (this.functionalTest.serverType === "restify") {
            delete req.path;
        }

        // The mock does not have a resume() function.  Simulate it.
        // Do not emit data until resume is called. Resume is automatically
        // called when pipe is called as well. We also want to make sure not to
        // emit twice if resume is called mutliple times.
        req.resume = () => {
            this.debug("resume() called");

            // Do this asynchronously.
            setTimeout(() => {
                if (!sent) {
                    sent = true;

                    if (this.requestOptions.body) {
                        this.debug("sending body");
                        req.emit("data", options.body);
                    } else {
                        this.debug("no body to send");
                    }

                    req.emit("end");
                }
            });
        };

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

        /**
         * Restify patches http.ServerResponse.prototype directly, so
         * we need to use that specific event emitter. However, the
         * mock library doesn't set the .req property and creation of
         * the response will fail because the constructor requires
         * the request as an argument.  The constructor tries to read
         * req.method, causing a TypeError. Patch this by providing
         * a bizarre constructor that shims in the necessary information.
         *
         * @constructor
         */
        function modifiedServerResponse() {
            http.ServerResponse.call(this, options.req);
        }

        if (this.functionalTest.serverType === "restify") {
            // Inherit from http.ServerResponse so we get Restify's
            // functions.
            modifiedServerResponse.prototype = Object.create(http.ServerResponse.prototype);

            // Because we use the http.ServerResponse and it only defines
            // a getter for headersSent(), we need to override it.  The
            // mock assigns something to that property.
            Object.defineProperty(modifiedServerResponse.prototype, "headersSent", {
                configurable: true,
                writable: true
            });

            options.eventEmitter = modifiedServerResponse;
        } else {
            options.eventEmitter = EventEmitter;
        }

        res = nodeMocksHttp.createResponse(options);

        // The mock adds simulated methods. Delete them and let the
        // framework use the send method that was added to the prototype.
        delete res.contentType;
        delete res.format;
        delete res.getHeader;
        delete res.send;

        // If we delete res.getHeader we have to delete header and
        // setHeader so that Restify falls back to http's functions so they set
        // headers on the same property to avoid inconsistency.
        if (this.functionalTest.serverType === "restify") {
            delete res.header;
            delete res.setHeader;
        }

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

            // Issue the request to the router.
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
    toString(colorize) {
        var result;

        if (!colorize && colorize !== false) {
            colorize = true;
        }

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
     * Convert the request into a useful string.
     *
     * @param {boolean} colorize
     * @return {string}
     */
    toStringRequest(colorize) {
        var body, header, result;

        result = [];
        header = `${this.requestOptions.method} ${this.requestOptions.url}`;

        if (colorize) {
            header = chalk.yellow(header);
        }

        result.push(header);
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
