# Standalone release setup

Publication starts disabled behind repository variable `NPM_TRUSTED_PUBLISHING_ENABLED=true`. The migration does not publish packages or images, deploy services, configure credentials, or create release tags.

Configure npm trusted publishing for splitintech, this repository and its publish workflow before enabling it. Keep existing package names and tag prefixes. Do not republish an existing version to change repository metadata. Run the complete standalone checks and packed-consumer verification before assigning a release version and tag.

Historical source copies are not release authorities. Product releases originate here after repository-specific configuration. See README for operational limits.
