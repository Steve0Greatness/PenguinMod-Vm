const JSZip = require('jszip');
const sb3 = require('../serialization/sb3');
const { createTwoFilesPatch } = require('diff');
const sha256 = require('js-sha256');
const fflate = require('fflate');

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
        this.current_branch = "main";

        this.diffing_codebase = {};

        this._removed_name = "$rem";
        this._file_name = "VERSIONING.ignore";

        this._decoder = new TextDecoder();
        this._encoder = new TextEncoder();
    }

    addCommit(log, author) {
        // TODO
        const project_json = JSON.stringify(
            sb3.serialize(this.vm.runtime),
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

        for (let asset of this.vm.serializeAssets()) {
            files[asset.fileName] = asset.fileContent;
        }

        const diff = {
            [this._removed_name]: []
        };

        for (let file in files) {
            // Only add different files.
            if (file == "project.json" && this.diffing_codebase["project.json"] !== files[file]) {
                diff["project.json"] = new TextEncoder().encode(createTwoFilesPatch(
                    "a", "b",
                    this.diffing_codebase["project.json"] ?? "",
                    files[file]
                ));
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

        if (Object.keys(diff).length == 1 && diff[this._removed_name].length == 0) {
            return null; // No change committed
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
        const fileContent = fflate.compressSync(fflate.strToU8(
            JSON.stringify({
                commits: this.commits,
                branches: this.branches,
                current: this.current_branch,
            }, (_, value) => {
                if (value instanceof Map) {
                    return {
                        type: "Map",
                        value: Array.from(value.entries()),
                    };
                } else if (value instanceof Uint8Array) {
                    return this._decoder.decode(value);
                }
                return value;
            })
        ), { level: 9 });
        return {
            fileName: this._file_name,
            fileContent,
        }
    }

    deserialize(contents) {
        // TODO
    }

}

module.exports = VersionControl
