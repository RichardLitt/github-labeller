// Dependencies
var GitHub = require("gh.js")
  , EventEmitter = require("events").EventEmitter
  , SameTime = require("same-time")
  ;

/**
 * GitHubLabeller
 * Adds the provided labels to specified repository or to all repositories from
 * specified account.
 *
 * @name GitHubLabeller
 * @function
 * @param {Array} labels An array of objects like this:
 * @param {Object} options An object containing the following fields:
 *
 *  - `repo` (String): A string like `"user/repository"` or `"user"`–in this case
 *    the labels will be created in all repositories
 *  - `source` (String): If provided, the tool will take the labels from this repository.
 *  - `token` (String): The GitHub token.
 *
 * @param {Function} callback The callback function.
 * @return {EventEmitter} An event emitter you can use for listening for specific events:
 *
 *  - `added` (owner, repo, label, err, data)–after a label was created
 */
function GitHubLabeller (labels, options, callback) {

    var ev = new EventEmitter()
      , i = 0
      , repo = null
      , user = null
      , splits = null
      , gh = null
      , cLabel = null
      ;

    if (!labels.length && !options.source) {
        callback(null, null);
        return ev;
    }

    gh = new GitHub({ token: options.token });
    if (options.source) {
        gh.get("repos/" + options.source + "/labels", { all: true }, function (err, lbls) {
            if (err) { return callback(err); }
            delete options.source;
            labels = labels.concat(lbls);
            var gl = GitHubLabeller(labels, options, callback);
            gl.on("added", ev.emit.bind(ev, "added"));
        });
        return ev;
    }

    // Normalize labels
    for (; i < labels.length; ++i) {
        cLabel = labels[i];
        cLabel = labels[i] = {
            name: cLabel.name || cLabel.label
          , color: cLabel.color.charAt(0) === "#"
                 ? cLabel.color.substring(1)
                 : cLabel.color
        };
        if (!cLabel.name) {
            callback(new Error("Missing name for label: " + i));
            return ev;
        }
        if (!cLabel.color) {
            callback(new Error("Missing color for label: " + i));
            return ev;
        }
    }

    repo = options.repo

    // user/repo
    splits = repo.split("/");
    if (splits.length === 2) {
        user = splits[0];
        repo = splits[1];
    } else {
        user = repo;
        repo = null;
    }

    if (repo) {
        GitHubLabeller.checkRepo(ev, gh, user, repo, labels, callback);
    } else {
        gh.get("users/" + user + "/repos", { all: true }, function (err, repos) {
            if (err) { return callback(err); }
            SameTime(repos.map(function (c) {
                return function (done) {
                    GitHubLabeller.checkRepo(ev, gh, user, c.name, labels, done);
                }
            }), callback);
        });
    }

    return ev;
}

/**
 * checkRepo
 * Check the current labels, then post or patch new ones.
 *
 * @name checkRepo
 * @function
 * @param {EventEmitter} ev The event emitter instance.
 * @param {GitHub} gh The `gh.js` instance.
 * @param {String} owner The owner username.
 * @param {String} repo The repository name.
 * @param {Object} label The label object.
 * @param {Function} callback Callback function
 * @return {Request} The request object.
 */
GitHubLabeller.checkRepo = function (ev, gh, owner, repo, label, callback) {
    return gh.get("repos/" + owner + "/" + repo + "/labels", function (err, labels) {
      var i = 0;

      if (err) { return callback(err); }

      for (; i < labels.length; ++i) {
          labels[i] = labels[i].name;
      }

      GitHubLabeller.addToRepo(ev, gh, owner, repo, label, labels, callback);
    });
};

/**
 * addToRepo
 * Creates a new label.
 *
 * @name addToRepo
 * @function
 * @param {EventEmitter} ev The event emitter instance.
 * @param {GitHub} gh The `gh.js` instance.
 * @param {String} owner The owner username.
 * @param {String} repo The repository name.
 * @param {Object} label The label object.
 * @param {Array} label The list of current labels.
 * @param {Function} callback Callback function
 * @return {Request} The request object.
 */
GitHubLabeller.addToRepo = function (ev, gh, owner, repo, label, labels, callback) {
    var endpoint = "repos/" + owner + "/" + repo + "/labels";

    if (Array.isArray(label)) {
        return SameTime(label.map(function (c) {
            return function (done) {
                GitHubLabeller.addToRepo(ev, gh, owner, repo, c, labels, function (err, data) {
                    ev.emit("added", owner, repo, c, err, data);
                    done(null, data);
                });
            };
        }), callback);
    }

    if (labels.indexOf(label.name) > -1) {
        endpoint += "/" + encodeURIComponent(label.name);
    }

    return gh.get(endpoint, { data: label }, callback);
};

module.exports = GitHubLabeller;
