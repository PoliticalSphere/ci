PS Bootstrap composite action

Usage:

- name: Bootstrap (PS)
  uses: ./.github/actions/ps-bootstrap
  with:
    platform_root: ${{ github.workspace }}/.ps-platform
    home_dir: ".home"

This action runs the branding print section and sets an isolated workspace-local HOME by writing to GITHUB_ENV.