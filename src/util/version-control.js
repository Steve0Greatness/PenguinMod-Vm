const JSZip = require('jszip');
const sb3 = require('../serialization/sb3');
const { createTwoFilesPatch, applyPatch } = require('diff');
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

    createBranch(branch, from=null) {
        if (this.commits.size == 0)
            return false;
        if (from == null)
            from = this.branches.get(this.current_branch);
        this.branches.set(branch, from);
        return true;
    }

    switchBranch(branch) {
        if (!this.branches.has(branch)) {
            return false;
        }
        this.diffing_codebase = this.construct_to_commit(this.branches.get(branch));
        this.current_branch = branch;
        return true;
    }

    construct_to_commit(commit_id) {
        const commits = [];
        var commit = this.commits.get(commit_id);
        var lonely = commit.previous == null;

        if (!commit) return null; // Commit doesn't exist

        do {
            commits.push(commit.files);
            if (commit.previous != null)
                commit = this.commits.get(commit.previous)
        } while (commit.previous != null)
        if (!lonely) {
            commits.push(commit.files);
        }

        commits.reverse();

        var files = new Map([
            ["project.json", ""]
        ]);

        for (let commit of commits) {
            for (let file in commit) {
                if (file === this._removed_name) continue;
                var content = commit[file];
                if (file === "project.json") {
                    let current = files.get("project.json");
                    let application = applyPatch(
                        current, // files.get("project.json")
                        this._decoder.decode(content)
                    );
                    files.set("project.json", application);
                    continue;
                }
                files.set(file, content);

            }
            var removed = commit[this._removed_name];
            for (let file of removed) {
                files.delete(file);
            }
        }

        return Object.fromEntries(files.entries());
    }

    addCommit(log, author) {
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
            files[asset.fileName] = Array.from(asset.fileContent);
        }

        const diff = {
            [this._removed_name]: []
        };

        for (let file in files) {
            // Only add different files.
            let project_json = file === "project.json";
            let content_matches = (file in this.diffing_codebase) && // exists
                (sha256(this.diffing_codebase[file] ?? "") == sha256(files[file])); // content matches

            if (project_json && !content_matches) {
                const projectjson = createTwoFilesPatch(
                    "a", "b",
                    this.diffing_codebase["project.json"] ?? "",
                    files[file]
                );
                diff["project.json"] = this._encoder.encode(projectjson);
                continue;
            }

            if (project_json || content_matches) {
                continue;
            }

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
            "files": diff,
            date: Date.now(),
            previous, log, author
        };
        const commit_id = sha256.hex(JSON.stringify(commit_object));

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
        const serialized = JSON.parse(
            fflate.decompressSync(fflate.strToU8(contents)),
            (_, value) => {
                if (value.type === "Map") {
                    return new Map(value.value);
                }
                return value;
            }
        );

        this.commits = serialized.commits;
        this.branches = serialized.branches;
        this.current_branch = serialized.current;

        this.diffing_codebase = this.commits.size
            ? this.construct_to_commit(this.branches.get(this.current_branch))
            : {};
    }
}

module.exports = VersionControl
