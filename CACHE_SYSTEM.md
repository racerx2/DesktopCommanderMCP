# Desktop Commander MCP - Conversation Cache System

## 🧠 Complete Guide to Unlimited Conversation Continuity

The conversation cache system transforms Claude from a session-limited assistant into a persistent development partner with unlimited memory. Perfect for complex coding projects, research, and long-term development work.

## Table of Contents
- [Overview](#overview)
- [Quick Start](#quick-start)
- [All 10 Cache Tools](#all-10-cache-tools)
- [Topic-Based Isolation](#topic-based-isolation)
- [Advanced Configuration](#advanced-configuration)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

### What It Solves
- **Session Limits**: Never lose context when hitting conversation limits
- **Project Complexity**: Maintain context for intricate codebases and architectures
- **Long-Term Development**: Build understanding over weeks/months of work
- **Context Mixing**: Keep different projects completely separate

### How It Works
- **File-Based Storage**: Structured markdown files preserve conversation context
- **Topic Isolation**: Each project gets completely separate memory
- **Auto-Updates**: Real-time progress saving (default: every 1 tool call)
- **Session Resumption**: Instant context restoration in new conversations

### Cache File Structure
```
C:\Claude_Session\
├── my_coding_project\              # Topic: Complete isolation
│   ├── conversation_log.md         # All conversation history
│   ├── current_project_state.md    # Technical details & architecture
│   ├── decisions_made.md           # Key decisions with rationale
│   └── next_steps.md              # Current priorities & actions
├── research_analysis\              # Different topic: Zero mixing
│   └── ... (same structure)
└── session_manifest.json          # Topic tracking & metadata
```

## Quick Start

### 1. Simple Setup (Recommended)
```javascript
// Just provide topic name - everything else is automatic
start_cache({
  "topic": "my_awesome_project"
})
```

### 2. Update During Work (Automatic)
Auto-updates are enabled by default every tool call, so your cache stays current automatically!

### 3. Resume in New Conversation
```javascript
// Instantly restore complete context
load_cache({
  "topic": "my_awesome_project"
})
```

That's it! You now have unlimited conversation continuity.

## All 10 Cache Tools

### Quick Start Tools

#### `start_cache` - Simplest Setup
```javascript
start_cache({
  "topic": "quantum_physics_research"
})
```
**What it does**: Creates topic-isolated cache with optimal defaults
- Enables auto-updates (every 1 tool call)
- Creates all cache files
- Sets up topic isolation
- Ready for immediate use

#### `handle_conversation_title` - Automatic Setup
```javascript
handle_conversation_title({
  "conversationTitle": "AI Assistant Development"
})
```
**What it does**: Converts Claude's conversation title to topic name
- "AI Assistant Development" → topic: "ai_assistant_development"
- Automatic topic creation and loading
- Seamless integration with Claude's natural naming

### Core Cache Tools

#### `init_cache` - Full Control Setup
```javascript
init_cache({
  "cacheDir": "C:\\MyProjects_Cache",
  "projectName": "Advanced AI System",
  "topic": "ai_system_v2", 
  "confirmCreate": true,
  "understoodGrowth": true,
  "sessionOnly": false
})
```
**Parameters**:
- `cacheDir`: Custom cache location (default: "C:\\Claude_Session")
- `projectName`: Descriptive project name
- `topic`: Topic identifier for isolation
- `confirmCreate`: Explicit permission for directory creation (default: true)
- `understoodGrowth`: Acknowledge cache files will grow (default: true)
- `sessionOnly`: Mark as temporary session (default: false)

#### `update_cache` - Manual Progress Updates
```javascript
update_cache({
  "topic": "ai_system_v2",
  "conversationSummary": "Implemented neural network architecture with attention mechanism",
  "projectUpdate": "Added transformer layers and position encoding. Model now handles 512 token context.",
  "decisionsUpdate": "Decided to use ReLU activation instead of GELU for better performance on our hardware",
  "nextStepsUpdate": "Next: Implement training loop and validation metrics. Then optimize for inference speed."
})
```
**Parameters**:
- `conversationSummary` (required): Current conversation progress
- `projectUpdate` (optional): Technical/architectural changes
- `decisionsUpdate` (optional): Important decisions made
- `nextStepsUpdate` (optional): Updated priorities and actions
- `topic` (optional): Target topic (uses active topic if omitted)

#### `load_cache` - Context Restoration
```javascript
// Load specific topic
load_cache({
  "topic": "ai_system_v2"
})

// Load from custom location
load_cache({
  "cacheDir": "C:\\MyProjects_Cache",
  "topic": "ai_system_v2"
})

// Load legacy cache (pre-topic system)
load_cache({
  "useLegacy": true
})
```
**Parameters**:
- `topic` (optional): Specific topic to load
- `cacheDir` (optional): Custom cache directory (default: "C:\\Claude_Session")
- `useLegacy` (optional): Load pre-topic cache format

#### `get_cache_status` - System Health Check
```javascript
// Global status
get_cache_status()

// Topic-specific status
get_cache_status({
  "topic": "ai_system_v2"
})
```
**Returns**: Comprehensive status including:
- Initialization status
- Auto-update configuration
- Tool call counts
- Last update timestamps
- File existence and health
- Topic-specific or global information

### Management Tools

#### `auto_update_cache` - Configure Automatic Updates
```javascript
// Enable real-time updates (default)
auto_update_cache({
  "enable": true,
  "updateInterval": 1,    // Every 1 tool call
  "topic": "ai_system_v2"
})

// Less frequent updates
auto_update_cache({
  "enable": true,
  "updateInterval": 5,    // Every 5 tool calls
  "topic": "ai_system_v2"
})

// Disable auto-updates (manual only)
auto_update_cache({
  "enable": false,
  "topic": "ai_system_v2"
})
```
**Parameters**:
- `enable` (required): true/false to enable/disable auto-updates
- `updateInterval` (optional): Tool calls between updates (default: 1)
- `topic` (optional): Target topic (uses active topic if omitted)

#### `get_cache_topics` - Project Discovery
```javascript
// List all available topics
get_cache_topics()

// List from custom location
get_cache_topics({
  "cacheDir": "C:\\MyProjects_Cache"
})
```
**Returns**: Detailed information about all topics:
- Project names and descriptions
- Creation and last-used dates
- Auto-update status per topic
- Session types (temporary vs persistent)
- Directory paths and file status

#### `archive_cache` - Complete Projects
```javascript
archive_cache({
  "topic": "completed_project",
  "confirmArchive": true
})
```
**What it does**:
- Marks topic as archived (preserves all data)
- Removes from active topics list
- Clears auto-update settings
- Files remain accessible for future reference

#### `cleanup_cache` - Maintenance
```javascript
cleanup_cache({
  "cleanupAfterDays": 30,     // Remove topics older than 30 days
  "maxSessions": 10,          // Keep only 10 most recent topics
  "confirmCleanup": true
})
```
**Parameters**:
- `cleanupAfterDays` (optional): Age threshold for removal (default: 30)
- `maxSessions` (optional): Maximum topics to keep (default: 10)
- `confirmCleanup` (required): Explicit confirmation for safety

## Topic-Based Isolation

### Complete Memory Separation
Each topic maintains completely isolated memory:
```javascript
// Coding project memory
start_cache({"topic": "react_dashboard"})
// Stores: React components, state management, API integrations

// Research project memory  
start_cache({"topic": "ai_ethics_research"})
// Stores: Research papers, analysis, ethical frameworks

// Game development memory
start_cache({"topic": "unity_rpg_game"})
// Stores: Game mechanics, character systems, level design
```

**Zero Cross-Contamination**: React knowledge never mixes with AI research or game development contexts.

### Parallel Development
Work on multiple projects simultaneously:
```javascript
// Morning: Work on React dashboard
load_cache({"topic": "react_dashboard"})
// (Claude has complete React project context)

// Afternoon: Switch to AI research  
load_cache({"topic": "ai_ethics_research"})
// (Claude has complete research context, zero React contamination)

// Evening: Game development
load_cache({"topic": "unity_rpg_game"})
// (Claude has complete game development context)
```

### Topic Naming Best Practices
```javascript
// Good topic names (descriptive, unique)
"ecommerce_backend_api"
"machine_learning_course" 
"mobile_app_flutter"
"data_analysis_project"

// Avoid generic names
"project"
"work"
"coding"
"temp"
```

## Advanced Configuration

### Custom Cache Locations
```javascript
// Organize by client/company
init_cache({
  "cacheDir": "C:\\ClientA_Projects",
  "topic": "web_redesign",
  "projectName": "Client A - Website Redesign"
})

init_cache({
  "cacheDir": "C:\\ClientB_Projects", 
  "topic": "mobile_app",
  "projectName": "Client B - Mobile App Development"
})
```

### Different Update Strategies
```javascript
// Real-time updates (default) - Best for active development
auto_update_cache({
  "enable": true,
  "updateInterval": 1,
  "topic": "active_project"
})

// Milestone updates - Best for research/planning phases
auto_update_cache({
  "enable": true, 
  "updateInterval": 10,
  "topic": "research_project"
})

// Manual updates only - Best for sensitive projects
auto_update_cache({
  "enable": false,
  "topic": "confidential_project"
})
```

### Session Types
```javascript
// Persistent project (default) - Keeps forever
init_cache({
  "topic": "long_term_project",
  "sessionOnly": false
})

// Temporary session - Auto-cleanup after 7 days
init_cache({
  "topic": "quick_experiment",
  "sessionOnly": true
})
```

## Real-World Examples

### Example 1: Complex Web Application Development
```javascript
// Initialize for new project
start_cache({
  "topic": "ecommerce_platform"
})

// During development (auto-updates capture progress)
// - Built user authentication system
// - Implemented shopping cart functionality  
// - Added payment integration
// - Set up order management

// Hit conversation limit, start new session
load_cache({
  "topic": "ecommerce_platform"
})
// Claude instantly knows: auth system, cart logic, payment flow, order management
// Continue exactly where you left off!
```

### Example 2: Research Project Over Multiple Weeks
```javascript
// Week 1: Start research
start_cache({
  "topic": "climate_change_analysis"
})

// Week 2: Continue research (different session)
load_cache({
  "topic": "climate_change_analysis"
})
// Claude remembers: previous research, data sources, analysis methods, findings

// Week 3: Writing phase (another session)
load_cache({
  "topic": "climate_change_analysis"
})
// Claude knows: complete research context, ready to help with writing

// Weeks later: Return to project
load_cache({
  "topic": "climate_change_analysis"})
// Complete context restoration, no knowledge loss!
```

### Example 3: Multiple Parallel Projects
```javascript
// Monday: E-commerce work
load_cache({"topic": "ecommerce_platform"})
// Complete e-commerce context loaded

// Tuesday: Switch to mobile app  
load_cache({"topic": "flutter_fitness_app"})
// Complete mobile app context, zero e-commerce mixing

// Wednesday: Back to e-commerce
load_cache({"topic": "ecommerce_platform"})
// E-commerce context restored exactly as left Monday

// Thursday: Research project
load_cache({"topic": "machine_learning_research"})
// ML research context, isolated from all other projects
```

## Best Practices

### 1. Topic Organization
```javascript
// Use descriptive, project-specific names
"frontend_react_dashboard"        // ✅ Clear and specific
"backend_nodejs_api"             // ✅ Technology and purpose clear
"mobile_ios_fitness_tracker"     // ✅ Platform and function clear

"project1"                       // ❌ Too generic
"work"                          // ❌ No context
"temp"                          // ❌ Unclear purpose
```

### 2. Regular Updates for Large Changes
```javascript
// After major milestones, add explicit updates
update_cache({
  "topic": "web_app_project",
  "conversationSummary": "Completed user authentication system implementation",
  "projectUpdate": "Added JWT tokens, password hashing, and OAuth2 integration. Database schema updated with user roles table.",
  "decisionsUpdate": "Decided to use bcrypt for password hashing (12 rounds) and Redis for session storage",
  "nextStepsUpdate": "Next: Implement admin dashboard and user profile management system"
})
```

### 3. Archive Completed Projects
```javascript
// When project is finished
archive_cache({
  "topic": "completed_client_website",
  "confirmArchive": true
})
// Preserves all data but removes from active list
```

### 4. Regular Cleanup
```javascript
// Monthly maintenance
cleanup_cache({
  "cleanupAfterDays": 60,      // Keep 2 months of projects
  "maxSessions": 15,           // Keep 15 most recent projects
  "confirmCleanup": true
})
```

### 5. Monitor Cache Health
```javascript
// Regular health checks
get_cache_status()              // Global overview
get_cache_topics()              // All project status
get_cache_status({"topic": "important_project"})  // Specific project health
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: Cache Not Updating
```javascript
// Check auto-update status
get_cache_status({"topic": "your_topic"})

// Re-enable auto-updates
auto_update_cache({
  "enable": true,
  "updateInterval": 1,
  "topic": "your_topic"
})
```

#### Issue: Can't Find My Topics
```javascript
// List all topics
get_cache_topics()

// Check different cache directory
get_cache_topics({
  "cacheDir": "C:\\Different_Location"
})
```

#### Issue: Context Not Loading Properly
```javascript
// Check if topic exists
get_cache_status({"topic": "missing_topic"})

// Try loading with explicit directory
load_cache({
  "cacheDir": "C:\\Claude_Session",
  "topic": "your_topic"  
})

// Check for legacy cache
load_cache({"useLegacy": true})
```

#### Issue: Too Many Old Topics
```javascript
// Clean up old topics
cleanup_cache({
  "cleanupAfterDays": 30,
  "maxSessions": 10,
  "confirmCleanup": true
})

// Archive completed projects first
archive_cache({
  "topic": "old_completed_project",
  "confirmArchive": true
})
```

#### Issue: Cache Files Corrupted
```javascript
// Reinitialize topic with same name
init_cache({
  "topic": "corrupted_topic",
  "projectName": "Restored Project",
  "confirmCreate": true
})

// Then manually update with known context
update_cache({
  "topic": "corrupted_topic",
  "conversationSummary": "Restored cache after corruption. Previous work included: [list what you remember]",
  "projectUpdate": "Recreating project context after cache restoration"
})
```

### Error Messages and Solutions

#### "Cache system not initialized"
```javascript
// Solution: Initialize the cache first
start_cache({"topic": "your_topic"})
```

#### "Topic not found"  
```javascript
// Solution: Check available topics
get_cache_topics()

// Or initialize new topic
start_cache({"topic": "new_topic"})
```

#### "Permission required to create cache directory"
```javascript
// Solution: Provide explicit permission
init_cache({
  "topic": "your_topic",
  "confirmCreate": true,
  "understoodGrowth": true
})
```

### Performance Optimization

#### For Large Projects
```javascript
// Use longer update intervals for very large projects
auto_update_cache({
  "enable": true,
  "updateInterval": 5,     // Update every 5 tool calls instead of 1
  "topic": "large_project"
})
```

#### For Multiple Active Projects
```javascript
// Use specific cache directories to organize
init_cache({
  "cacheDir": "C:\\ActiveProjects",
  "topic": "current_work",
  "projectName": "Current Active Project"
})

init_cache({
  "cacheDir": "C:\\ClientWork", 
  "topic": "client_project",
  "projectName": "Client Project Name"
})
```

## Security Considerations

### Sensitive Information
- Cache files contain conversation history - protect sensitive data
- Use appropriate directory permissions for cache storage
- Consider separate topics for different security contexts
- Archive or cleanup caches containing sensitive data when projects complete

### Directory Permissions
```javascript
// Use secure locations for sensitive projects
init_cache({
  "cacheDir": "C:\\SecureProjects\\ClientConfidential",
  "topic": "confidential_project",
  "projectName": "Confidential Client Work"
})
```

### Cleanup Sensitive Data
```javascript
// Archive sensitive completed projects
archive_cache({
  "topic": "sensitive_project",
  "confirmArchive": true
})

// Or clean up immediately
cleanup_cache({
  "cleanupAfterDays": 1,      // Remove after 1 day
  "maxSessions": 0,           // Don't keep any
  "confirmCleanup": true
})
```

## Conclusion

The conversation cache system transforms Claude into a persistent development partner with unlimited memory. With 10 comprehensive tools and topic-based isolation, you can:

- ✅ **Never lose context** across conversation sessions
- ✅ **Work on multiple projects** simultaneously without context mixing  
- ✅ **Build cumulative knowledge** over weeks/months of development
- ✅ **Resume exactly** where you left off in any project
- ✅ **Organize and manage** complex development workflows

Start with simple `start_cache({"topic": "your_project"})` and experience unlimited conversation continuity!

For more help, check the main README or examine the cache system implementation in `src/handlers/cache-handlers.ts`.

**Happy coding with unlimited memory!** 🚀🧠
