const JSZip = require('jszip');
const sb3 = require('./serialization/sb3');
const { diffLines } = require('diff');
const sha256 = require('js-sha256');

class VersionControl {
    constructor(vm) {
        this.vm = vm;

        //string =>
        //{
        //  log: string,
        //  date: number,
        //  previous: string,
        //  author: string,
        //  files: {
        //    [string]: string
        //  }
        //}
        this.commits = new Map();
        //string => string, key in commits
        this.branches = new Map([
            [ "main", null ]
        ]);
        this.current_branch = null;

        this.diffing_codebase = {};

        this._removed_name = "$rem";
    }

    addCommit(log, author) {
        // TODO
        const project_json = JSON.stringify(
            sb3.serialize(),
            (_key, value) => {
                if (typeof value === 'number' &&
                    (value === Infinity || value === -Infinity || isNaN(value))){
                    return 0;
                }
                return value;
            },
            "\n"
        );

        const files = {
            "project.json": project_json,
        };

        for (let asset of this.vm.serializeAssets) {
            files[asset.fileName] = assets.fileContent;
        }

        const diff = {
            [this._removed_name]: []
        };

        for (let file in files) {
            // Only add different files.
            if (file == "project.json") {
                diff["project.json"] = diffLines(this.diffing_codebase["project.json"], files[file]);
                continue;
            }
            if (file in this.diffing_codebase && this.diffing_codebase[file] == files[file]) continue;
            diff[file] = files[file];
        }

        for (let file in this.diffing_codebase) {
            // Add removed files to a removed cache, prefixed with a `$` to attempt
            // to prevent collisions.
            let content = this.diffing_codebase[file];
            if (file in files) continue;
            diff[this._removed_name].push(file);
        }

        this.diffing_codebase = files;

        let previous = null;
        if (this.current_branch) {
            previous = this.branches.get(this.current_branch);
        }

        const commit_object = {
            files: diff,
            date: Date.now(),
            previous, log, author
        };
        const commit_id = sha256.create()
            .update(JSON.stringify(commit_object))
            .hex();
        this.commits.set(commit_id, commit_object);
        this.branches.set(this.current_branch, commit_id);

        // Partially just for debugging.
        return [commit_id, commit_object];
    }

    serialize() {
        // TODO
        return {
            fileName: "VERSIONING.ignore",
            fileContent: "empty"
        }
    }

    deserialize(contents) {
        // TODO
    }

}

module.exports = VersionControl
