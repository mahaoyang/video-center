# Midjourney Parameter System - Reference Sources

## Collection Information
- **Collection Date**: 2025-12-30
- **Last Updated**: 2025-12-30
- **Total Parameters**: 26
- **Version Coverage**: V1-V7

## Primary Sources

### 1. Midjourney Complete Parameter List
- **URL**: https://learningprompt.wiki/docs/midjourney/mj-tutorial-list/midjourney-parameters-list
- **Status**: ✓ Accessed
- **Coverage**: Core parameters (v1-v5), basic usage examples
- **Quality**: Good for foundational parameters
- **Notes**: Clear explanations with examples

### 2. All MidJourney Parameters - Simple and Complete Overview
- **URL**: https://www.archiobjects.org/all-midjourney-parameters-a-simple-and-complete-overview/
- **Status**: ✓ Accessed
- **Coverage**: Core parameters with ranges and syntax examples
- **Quality**: Excellent for parameter ranges and value constraints
- **Notes**: Well-structured with clear syntax examples

### 3. Midjourney Cheat Sheet (SREF)
- **URL**: https://sref-midjourney.com/cheatsheet
- **Status**: ✓ Accessed
- **Coverage**: Comprehensive list including v6+ features (sref, cref, motion, weird)
- **Quality**: ★★★★★ Most complete source
- **Notes**: Best source for advanced parameters, includes latest features

### 4. 2025 Midjourney Prompts Cheat Sheet
- **URL**: https://www.aiarty.com/midjourney-prompts/midjourney-prompts-cheat-sheet.htm
- **Status**: ✗ Could not access (network restrictions)
- **Coverage**: Latest 2025 parameters and tips
- **Notes**: Should check this source when network allows

### 5. Midjourney Parameter Cheat Sheet V7
- **URL**: https://runtheprompts.com/resources/midjourney-info/midjourney-parameter-cheat-sheet-v7/
- **Status**: ⚠ Partial access (CSS only, no content)
- **Coverage**: V7 specific parameters
- **Notes**: Should retry fetching when possible

### 6. Official Midjourney Documentation
- **URL**: https://docs.midjourney.com/hc/en-us/articles/32859204029709-Parameter-List
- **Status**: ✗ Could not access (network restrictions)
- **Coverage**: Official parameter documentation
- **Quality**: ★★★★★ Authoritative source
- **Notes**: This is the gold standard - check regularly for updates

## Additional Resources to Check

### Official Channels
- **Midjourney Discord**: https://discord.gg/midjourney
  - Announcements channel for new features
  - #status-updates for version releases

- **Midjourney Blog**: https://www.midjourney.com/blog
  - Official announcements
  - Version release notes

### Community Resources
- **Midjourney Subreddit**: https://www.reddit.com/r/midjourney/
  - Community discoveries
  - Parameter experiments

- **GitHub Awesome Lists**: Search for "awesome-midjourney"
  - Curated parameter lists
  - Community tools

## Update Schedule Recommendations

### Weekly Checks
- Midjourney Discord announcements
- Official documentation updates

### Monthly Reviews
- Community resources (Reddit, GitHub)
- Blog posts and tutorials

### Version Release Checks
- When new version announced (V8, V9, etc.)
- Check all sources for new parameters
- Update version_compatibility fields
- Add new parameters to system

## Parameter Coverage by Source

| Parameter Category | Primary Source | Secondary Source |
|-------------------|----------------|------------------|
| Core Parameters | learningprompt.wiki | archiobjects.org |
| Style Parameters | sref-midjourney.com | archiobjects.org |
| Processing Modes | sref-midjourney.com | - |
| Reference Params | sref-midjourney.com | - |
| Video Parameters | sref-midjourney.com | - |
| Special Features | sref-midjourney.com | archiobjects.org |

## Known Gaps

1. **V7 Specific Features**: Could not fully access V7 documentation
   - Action: Retry runtheprompts.com when network allows
   - Action: Check official docs when accessible

2. **2025 Updates**: Could not access aiarty.com
   - Action: Retry when network restrictions lifted
   - May contain newest parameters not yet documented elsewhere

3. **Official Documentation**: Could not access docs.midjourney.com
   - Action: This should be checked regularly as authoritative source
   - May have parameters not documented in community sources

## Verification Status

| Parameter | Verified | Source | Confidence |
|-----------|----------|--------|------------|
| --ar | ✓ | Multiple | High |
| --q | ✓ | Multiple | High |
| --s | ✓ | Multiple | High |
| --c | ✓ | Multiple | High |
| --seed | ✓ | Multiple | High |
| --no | ✓ | Multiple | High |
| --v | ✓ | Multiple | High |
| --iw | ✓ | Multiple | High |
| --tile | ✓ | Multiple | High |
| --style | ✓ | sref-midjourney.com | High |
| --fast | ✓ | sref-midjourney.com | High |
| --relax | ✓ | sref-midjourney.com | High |
| --turbo | ✓ | sref-midjourney.com | High |
| --sref | ✓ | sref-midjourney.com | High |
| --sv | ✓ | sref-midjourney.com | Medium |
| --sw | ✓ | sref-midjourney.com | High |
| --cref | ✓ | sref-midjourney.com | High |
| --cw | ✓ | sref-midjourney.com | High |
| --motion | ✓ | sref-midjourney.com | Medium |
| --raw | ✓ | sref-midjourney.com | Medium |
| --niji | ✓ | Multiple | High |
| --p | ✓ | sref-midjourney.com | High |
| --r | ✓ | Multiple | High |
| --stop | ✓ | Multiple | High |
| --video | ✓ | Multiple | High |
| --weird | ✓ | sref-midjourney.com | High |

## Next Steps for Improvement

1. **Access Official Documentation**
   - Try different network or VPN
   - Contact Midjourney support if needed
   - This is the authoritative source

2. **Test Parameters**
   - Verify each parameter with actual Midjourney API
   - Document any discrepancies
   - Update ranges based on actual behavior

3. **Community Validation**
   - Share with Midjourney community for feedback
   - Collect real-world usage examples
   - Update based on user reports

4. **Continuous Monitoring**
   - Set up alerts for Midjourney announcements
   - Check sources monthly
   - Update immediately when new versions release

## Contact for Updates

If you discover new parameters or find errors:
1. Check official Midjourney documentation first
2. Verify with multiple sources
3. Update mj_parameters.py following the UPDATE INSTRUCTIONS
4. Run tests to ensure compatibility
5. Update this SOURCES.md file with new information
