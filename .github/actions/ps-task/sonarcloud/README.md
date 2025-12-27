# SonarCloud Scan

Run SonarCloud analysis via a canonical task wrapper.

## Usage

```yaml
- name: SonarCloud scan
  uses: ./.github/actions/ps-task/sonarcloud
  with:
    organization: ${{ secrets.SONAR_ORGANIZATION }}
    project_key: ${{ secrets.SONAR_PROJECT_KEY }}
    token: ${{ secrets.SONAR_TOKEN }}
```

## Inputs

- `organization`: SonarCloud organization key.
- `project_key`: SonarCloud project key.
- `token`: SonarCloud token.
- `sources`: Source paths (comma-separated). Default: `.`.
- `host_url`: SonarCloud host URL. Default: `https://sonarcloud.io`.
