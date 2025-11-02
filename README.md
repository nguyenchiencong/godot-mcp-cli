# Godot MCP (Model Context Protocol)

A comprehensive integration between Godot Engine and AI assistants using the Model Context Protocol (MCP). This plugin allows AI assistants to interact with your Godot projects, providing powerful capabilities for code assistance, scene manipulation, and project management.

## Features

- **Full Godot Project Access**: AI assistants can access and modify scripts, scenes, nodes, and project resources
- **Two-way Communication**: Send project data to AI and apply suggested changes directly in the editor
- **Command Categories**:
  - **Node Commands**: Create, modify, and manage nodes in your scenes
  - **Script Commands**: Edit, analyze, and create GDScript files
  - **Scene Commands**: Manipulate scenes and their structure
  - **Project Commands**: Access project settings and resources
  - **Editor Commands**: Control various editor functionality
  - **Enhanced Commands**: Access full scene tree, debug output, and asset management

## Enhanced Features (New)

This fork adds several significant improvements:

- **Complete Scene Tree Visibility**: Retrieve the entire scene hierarchy with `get_editor_scene_structure`
- **Dynamic Script Access**: Read and write any script by path with dynamic resource templates
- **Asset Management**: Query and organize project assets by type (images, audio, models, etc.)
- **Debug Output Access**: Retrieve runtime debug logs from the Godot editor
- **Node Transform Tools**: Easily update node position, rotation and scale

## Quick Setup

### 1. Clone the Repository

```bash
git clone https://github.com/waefrebeorn/Godot-MCP.git
cd Godot-MCP
```

### 2. Set Up the MCP Server

```bash
cd server
npm install
npm run build
# Return to project root
cd ..
```

### 3. Set Up Coding Assistant

1. Add the following configuration (or use the included `mcp.json` as a reference):

For STDIO:
```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": [
        "PATH_TO_YOUR_PROJECT/server/dist/index.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

For SSE: don't forget to build the server accordingly and start with npm start
```json
{
"mcpServers": {
  "godot-mcp": {
    "url": "http://localhost:8083/sse",
    "disabled": false,
    "alwaysAllow": []
  }
}
}
```
> **Note**: Replace `PATH_TO_YOUR_PROJECT` with the absolute path to where you have this repository stored.


2. Restart the coding assistant

### 4. Open the Example Project in Godot

1. Open Godot Engine
2. Select "Import" and navigate to the cloned repository
3. Open the `project.godot` file
4. The MCP plugin is already enabled in this example project

## Using MCP

After setup, you can work with your Godot project directly from Claude using natural language. Here are some examples:

### Example Prompts

```
@mcp godot-mcp read godot://script/current

I need help optimizing my player movement code. Can you suggest improvements?
```

```
@mcp godot-mcp run get-full-scene-tree

Add a cube in the middle of the scene and then make a camera that is looking at the cube.
```

```
@mcp godot-mcp read godot://scene/current

Create an enemy AI that patrols between waypoints and attacks the player when in range.
```

### New Enhanced Commands Examples

```
@mcp godot-mcp read godot://script/res://scripts/player.gd

Please analyze this player script and suggest improvements.
```

```
@mcp godot-mcp read godot://script/res://scripts/player.gd/metadata

What signals and helper methods does this script expose?
```

```
@mcp godot-mcp read godot://assets/images

List every image asset so I can review what art is already in the project.
```

```
@mcp godot-mcp run list_assets_by_type --type images

Show me all the images in my project and help me organize them better.
```

```
@mcp godot-mcp run execute_editor_script --code "
for node in get_tree().get_nodes_in_group('enemies'):
    node.set('health', 100)
print('All enemy health reset to 100')
"

Reset all enemy nodes' health to 100.
```

### Natural Language Tasks Claude Can Perform

- "Create a main menu with play, options, and quit buttons"
- "Add collision detection to the player character"
- "Implement a day/night cycle system"
- "Refactor this code to use signals instead of direct references"
- "Debug why my player character falls through the floor sometimes"
- "Show me the full structure of my scene tree and explain the relationships"
- "Generate a script for enemy AI that follows the player"

## Available Resources and Commands

### Resource Endpoints:
- `godot://script/current` - The currently open script
- `godot://script/{path}` - Any script by path (NEW)
- `godot://script/{path}/metadata` - Metadata (class, methods, signals) for a specific script (NEW)
- `godot://scene/current` - The currently open scene
- `godot://scene/tree` - Complete scene tree hierarchy (NEW)
- `godot://project/info` - Project metadata and settings
- `godot://assets/{type}` - Assets of specific type (NEW)
- `godot://debug/log` - Debug output from editor (NEW)

### Command Categories:

#### Node Commands
- `get-scene-tree` - Returns the scene tree structure
- `get-node-properties` - Gets properties of a specific node
- `create-node` - Creates a new node
- `delete-node` - Deletes a node
- `modify-node` - Updates node properties

#### Script Commands
- `list-project-scripts` - Lists all scripts in the project
- `read-script` - Reads a specific script
- `modify-script` - Updates script content
- `create-script` - Creates a new script
- `analyze-script` - Provides analysis of a script

#### Scene Commands
- `list-project-scenes` - Lists all scenes in the project
- `read-scene` - Reads scene structure
- `create-scene` - Creates a new scene
- `save-scene` - Saves current scene

#### Project Commands
- `get-project-settings` - Gets project settings
- `list-project-resources` - Lists project resources

#### Editor Commands
- `get-editor-state` - Gets current editor state
- `run-project` - Runs the project
- `stop-project` - Stops the running project
- `execute_editor_script` - Executes arbitrary GDScript code in the Godot editor context

#### Enhanced Commands (NEW)
- `get_editor_scene_structure` - Returns the current scene hierarchy with optional `include_properties`, `include_scripts`, and `max_depth` filters
- `get_debug_output` - Retrieves debug logs from editor
- `update_node_transform` - Updates node position, rotation, and scale
- `list_assets_by_type` - Lists project assets by type

## Troubleshooting

### Connection Issues
- Ensure the plugin is enabled in Godot's Project Settings
- Check the Godot console for any error messages
- Verify the server is running when Claude Desktop launches it

### Plugin Not Working
- Reload Godot project after any configuration changes
- Check for error messages in the Godot console
- Make sure all paths in your Claude Desktop config are absolute and correct

## Adding the Plugin to Your Own Godot Project

If you want to use the MCP plugin in your own Godot project:

1. Copy the `addons/godot_mcp` folder to your Godot project's `addons` directory
2. Open your project in Godot
3. Go to Project > Project Settings > Plugins
4. Enable the "Godot MCP" plugin

## New Files Added in This Fork

This fork adds several new files to the original project:

- `server/src/resources/asset_resources.ts` - Asset querying functionality
- `server/src/resources/debug_resources.ts` - Debug output access
- `addons/godot_mcp/mcp_enhanced_commands.gd` - Enhanced command processor
- `addons/godot_mcp/mcp_script_resource_commands.gd` - Script resource processor
- `addons/godot_mcp/mcp_asset_commands.gd` - Asset commands processor

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request to the [GitHub repository](https://github.com/waefrebeorn/Godot-MCP).

## Documentation

For more detailed information, check the documentation in the `docs` folder:

- [Getting Started](docs/getting-started.md)
- [Installation Guide](docs/installation-guide.md)
- [Command Reference](docs/command-reference.md)
- [Architecture](docs/architecture.md)
- [Enhanced Features Guide](docs/enhanced-features.md) (NEW)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
