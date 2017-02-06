"use strict";

var debug, FunctionalTestResult, lastId, querystring;

debug = require("debug")("FunctionalTest");
FunctionalTestResult = require("./functional-test-result");
lastId = 0;
querystring = require("querystring");


/**
 * Make functional testing easier by simulating requests and returning
 * promises that will result in a standard, easy to consume result
 * instance.
 */
class FunctionalTest {
    /**
     * Create a new functional test.  This will route requests through
     * the request handler (not middleware!) to simulate requests coming
     * through clients.
     *
     * @param {Function} requestHandler Handler, not middleware
     * @param {string} serverType
     */
    constructor(requestHandler, serverType) {
        lastId += 1;
        this.id = lastId;
        this.requestHandler = requestHandler;
        this.debug = (message) => {
            debug(`#${this.id}: ${message}`);
        };
        this.serverType = serverType;
        this.debug("created ${serverType} functional test");
    }


    /**
     * Converts a value into a Buffer.  Used for generating the body
     * of a request.
     *
     * @param {*} val
     * @return {Buffer}
     */
    coerseToBuffer(val) {
        if (Buffer.isBuffer(val)) {
            return val;
        }

        if (typeof val !== "string") {
            val = JSON.stringify(val);
        }

        return new Buffer(val, "binary");
    }


    /**
     * Find a header if it exists. Because headers are case insensitive,
     * this function scans across all headers.
     *
     * @param {Object} headers
     * @param {string} headerName
     * @return {(string|null)} Header's value
     */
    getHeader(headers, headerName) {
        var headerNameLower, result;

        headerNameLower = headerName.toLowerCase();
        result = null;
        Object.keys(headers).forEach((key) => {
            if (key.toLowerCase() === headerNameLower) {
                result = headers[key];
            }
        });

        return result;
    }


    /**
     * Set up reasonable defaults and convert incoming data into what
     * is expected by middleware.
     *
     * Modifies the object directly.
     *
     * @param {nodeMocksHttp~mockRequestOptions} options
     */
    reformatRequestOptions(options) {
        // Set localhost as a default Host header.
        if (!options.headers) {
            options.headers = {};
        }

        if (!this.getHeader(options.headers, "Host")) {
            options.headers.Host = "localhost";
        }

        this.reformatRequestUri(options);

        // Set some default properties for posting data.
        if (options.body) {
            options.body = this.coerseToBuffer(options.body);

            if (!this.getHeader(options.headers, "Content-Type")) {
                options.headers["Content-Type"] = "application/json";
            }
        }

        if (!options.timeoutMs) {
            options.timeoutMs = 2000;
        }
    }


    /**
     * Modifies the URI in the request.  Changes the object directly.
     *
     * @param {nodeMocksHttp~mockRequestOptions} options
     */
    reformatRequestUri(options) {
        // Munge the URI by adding parameters.  This is only for
        // parameterized URIs using templated link URIs.
        if (options.parameters) {
            Object.keys(options.parameters).forEach((key) => {
                options.url = options.url.split(`{${key}}`).join(options.parameters[key]);
            });
        }

        // Add query string options to the URI.  The URI is only the path
        // component here and does not contain the protocol, auth,
        // hostname nor port.
        if (options.query && Object.keys(options.query).length) {
            if (options.url.indexOf("?") === -1) {
                options.url += "?";
            }

            options.url += querystring.stringify(options.query);
        }
    }


    /**
     * Simulates a request, returns a promise, adjusts output and even
     * sets up a timer to automatically fail the request if it takes too
     * long.
     *
     * @param {string} method
     * @param {string} uri
     * @param {nodeMocksHttp~mockRequestOptions} [options]
     * @return {Promise.<FunctionalTestResult>}
     */
    requestAsync(method, uri, options) {
        var result;

        if (typeof options !== "object" || !options) {
            options = {};
        }

        options.method = method;
        options.url = uri;
        this.reformatRequestOptions(options);
        this.debug(`updated request options: ${JSON.stringify(options)}`);
        result = new FunctionalTestResult(this, options, {});

        return result.requestAsync(this.requestHandler);
    }
}


module.exports = FunctionalTest;
