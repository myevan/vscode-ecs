// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { normalize, extname } from 'path';
import { clearScreenDown } from 'readline';
import { setFlagsFromString } from 'v8';
import { timingSafeEqual } from 'crypto';

class Event {
	category:string;

	constructor(category:string) {
		this.category = category;
	}
}

class InputEvent extends Event {
	text:string;

	constructor(text:string) {
		super('INPUT');
		this.text = text;
	}
}

class Grid {
	width:number;
	height:number;
	lines:string[][];

	constructor(width:number, height:number, value:string) {
		let lines = new Array(height);
		for (let r = 0; r < height; ++r) {
			let line = new Array(width);
			for (let c = 0; c < width; ++c) {
				line[c] = value;	
			}
			lines[r] = line;
		}
		this.lines = lines;
		this.width = width;
		this.height = height;
	}

	set_value(row:number, col:number, value:string) {
		this.lines[row][col] = value;
	}

	fill_values(value:string) {
		for (let r = 0; r < this.height; ++r) {
			let line = this.lines[r];
			for (let c = 0; c < this.width; ++c) {
				line[c] = value;
			}
		}
	}

	get_line_text(row:number):string {
		return this.lines[row].join('');
	}
}

class Application {
	grid:Grid;
	cycle:number;
	outputLines:string[];
	inputLine:string;
	inputKey:string;
	
	constructor(fps:number, grid:Grid) {
		this.grid = grid;
		this.cycle = 1000 / fps;
		this.outputLines = new Array(grid.height);
		this.inputLine = "";
		this.inputKey = '';
	}

	run() {
		let _this = this;
		vscode.workspace.openTextDocument().then(doc => { 
			vscode.window.showTextDocument(doc).then(editor => {
				editor.edit(function(ed) {
					_this.start(editor, ed);
				}).then(() => {
					_this.tick(editor);
				});
			});
		});
	}

	start(editor:vscode.TextEditor, ed:vscode.TextEditorEdit) {
		let grid = this.grid;
		ed.delete(new vscode.Range(
			new vscode.Position(0, 0),
			new vscode.Position(grid.height, grid.width)
		));

		for (var r = 0; r < grid.height; r++)
		{
			ed.insert(new vscode.Position(r, 0), this.outputLines[r] + '\n');
		}
	}

	tick(editor:vscode.TextEditor) {
		let _this = this;
		editor.edit(function (ed) {
			if (_this.pump(editor, ed)) {
				_this.render(ed);
			}
		}).then(() => {
			setTimeout(() => {
				_this.tick(editor);
			}, _this.cycle);
		});
	}

	pump(editor:vscode.TextEditor, ed:vscode.TextEditorEdit) : boolean {
		let grid = this.grid;
		let doc = editor.document;
		if (doc.lineCount > this.grid.height)
		{
			let inputText = doc.lineAt(grid.height).text;
			ed.delete(new vscode.Range(
				new vscode.Position(grid.height, 0),
				new vscode.Position(grid.height, grid.width)
			));

			if (inputText.length > 0)
			{
				this.recv_event(new InputEvent(inputText));
				return true;
			}
			else
			{
				return false;
			}
		}
		else
		{
			return false;
		}
	}

	recv_event(event:Event) {

	}

	flush() {
		let grid = this.grid;
		for (let r = 0; r < grid.height; ++r) {
			this.outputLines[r] = grid.get_line_text(r);
		}
	}

	render(ed:vscode.TextEditorEdit) {
		let grid = this.grid;
		for (var r = 0; r < grid.height; r++)
		{
			var outputLine = this.outputLines[r];
			ed.replace(new vscode.Range(
				new vscode.Position(r, 0),
				new vscode.Position(r, outputLine.length)), 
				outputLine);
		}
	}
}

class Position {
	x:number;
	y:number;

	constructor(x:number, y:number) {
		this.x = x;
		this.y = y;
	}
}

class Shape {
	text:string;
	
	constructor(text:string) {
		this.text = text;
	}
}

class Component {
	static code = 0;
	static setCode(code:number) {
		Component.code = code;
	}
	static getCode() {
		return Component.code;
	}
	getCode():number {
		return Component.code;
	}
}

class ComponentFactory {
	typeMap:Map<number, typeof Component>;

	constructor() {
		this.typeMap = new Map<number, typeof Component>();
	}
	registerComponentType(compType:typeof Component) {
		let compCode = compType.getCode();
		this.typeMap.set(compCode, compType);
	}
	createComponent(compCode:number):Component|undefined {
		let compType = this.typeMap.get(compCode);
		if (!compType) { return undefined; }
		return new compType();
	}
}

class ComponentStorage {
	compFactory:ComponentFactory;
	compMap:Map<number, Component[]>;

	constructor(compFactory:ComponentFactory) {
		this.compFactory = compFactory;
		this.compMap = new Map<number, Component[]>();
	}

	spawnComponent(compCode:number):Component|undefined {
		let foundComps = this.compMap.get(compCode);
		if (!foundComps) { return undefined; }

		let newComp = this.compFactory.createComponent(compCode);
		if (!newComp) { return undefined; }
		foundComps.push(newComp);
		return newComp;
	}

	killComponent(inComp:Component) {
		let compCode = inComp.getCode();
		let foundComps = this.compMap.get(compCode);
		if (!foundComps) { return; }

		const foundIdx = foundComps.indexOf(inComp, 0);
		if (foundIdx > -1) {
			foundComps.splice(foundIdx, 1);
		}
	}

	getComponents(compType:typeof Component):Component[]|undefined {
		let compCode = compType.getCode();
		return this.compMap.get(compCode);
	}
}

interface IWorld {
	getComponents(compType:typeof Component):Component[]|undefined;
}

class Entity {
	world:IWorld;
	id = 0;
	comps:Component[];

	constructor(world:IWorld, id:number) {
		this.world = world;
		this.comps = new Array(16);
		this.id = id;
	}
	getId() {
		return this.id;
	}
	addComponent(comp:Component) {
		let compCode = comp.getCode();
		this.comps[compCode] = comp;
	}
	getComponent(compType:typeof Component):Component|undefined {
		let compCode = compType.getCode();
		return this.comps[compCode];
	}
	getComponetns(): Component[] {
		return this.comps;
	}
}

class System {
	update() {
	}
}

class ComponentPool {
	allocs:Component[];
	totals:Component[];
	frees:number[];
	checks:number[];
	capIdx:number;
	capSeq:number;
	nextSeq:number;
	baseSeq:number;

	constructor(type:typeof Component, code:number, cap:number) {
		let allocs = new Array();
		let totals = new Array(cap);
		let frees = new Array(cap);
		let checks = new Array(cap);
		for (let i = 0; i < cap; ++i) {
			let inst = new type();
			totals[i] = inst;
			frees[i] = i;
			checks[i] = 0;
		}
		this.totals = totals;
		this.frees = frees;
		this.checks = checks;
		this.allocs = allocs;
		this.capIdx = cap;
		this.capSeq  = 100;
		this.nextSeq = 1;
		this.baseSeq = code * this.capSeq * 10;
	}

	alloc():number {
		let freeIdx = this.frees.pop();
		if (!freeIdx) { return 0; }

		let freeInst = this.totals[freeIdx];
		let allocIdx = this.alloc.length;
		this.allocs.push(freeInst);
		let check = this.baseSeq + this.nextSeq;
		this.nextSeq += 2;
		this.nextSeq %= this.capSeq;
		this.checks[freeIdx] = check;
		return (check * this.capIdx + allocIdx) * this.capIdx + freeIdx;
	}

	free(handle:number):boolean {
		let freeIdx = handle % this.capIdx;
		let head = ~~(handle / this.capIdx); 
		let allocIdx = head % this.capIdx;
		let check = ~~(head / this.capIdx);
		if (check !== this.checks[freeIdx]) { return false; }
		this.frees.push(freeIdx);
		this.allocs.splice(allocIdx, 1);
		return true;
	}

	get(handle:number):Component|undefined {
		let freeIdx = handle % this.capIdx;
		let head = ~~(handle / this.capIdx); 
		let allocIdx = head % this.capIdx;
		let check = ~~(head / this.capIdx);
		if (check !== this.checks[freeIdx]) { return undefined; }
		return this.allocs[allocIdx];
	}

	gets():Component[] {
		return this.allocs;
	}
}

class World implements IWorld {
	nextId = 1;
	systems:System[];
	compPools:ComponentPool[];
	compStorage:ComponentStorage;
	entityMap:Map<number, Entity>;

	constructor(compFactory:ComponentFactory) {
		this.systems = [];
		this.compPools = new Array();
		this.compStorage = new ComponentStorage(compFactory);
		this.entityMap = new Map<number, Entity>();
	}

	addComponentPool(compType:typeof Component, cap:number) {
		let compCode = this.compPools.length;
		let compPool = new ComponentPool(compType, compCode, cap);
		this.compPools.push(compPool);
		compType.setCode(compCode);
	}

	getComponents(compType:typeof Component):Component[]|undefined {
		return this.compStorage.getComponents(compType);
	}

	addSystem(system:System) {
		this.systems.push(system);
	}

	spawnEntity(compTypes:typeof Component[]):Entity {
		let newId = this.nextId++;
		let newEntity =  new Entity(this, newId);
		for (let compType of compTypes) {
			let compCode = compType.getCode();
			let newComp = this.compStorage.spawnComponent(compCode);
			if (newComp) {
				newEntity.addComponent(newComp);
			}
		}
		this.entityMap.set(newId, newEntity);
		return newEntity;
	}

	killEntity(killId:number) {
		let foundEntity = this.entityMap.get(killId);
		if (!foundEntity) { return; }

		let foundComps = foundEntity.getComponetns();
		for (let comp of foundComps) {
			this.compStorage.killComponent(comp);
		}

		this.entityMap.delete(killId);
	}
	update() {
		for (let system of this.systems) {
			system.update();
		}
	}
}

class Actor extends Component {
	static code = 0;

	pos:Position;
	shape:Shape;

	constructor() {
		super();
		this.pos = new Position(0, 0);
		this.shape = new Shape('@');
	}

	static setCode(code:number) {
		Actor.code = code;
	}

	getCode():number {
		return Actor.code;
	}
}

class TextRenderSystem extends System {
	world:IWorld;

	constructor(world:IWorld) {
		super();
		this.world = world;
	}

	update() {
		let actors = this.world.getComponents(Actor);
	}
}

class ExampleApplication extends Application {
	constructor(fps:number, grid:Grid) {
		super(fps, grid);

		let compFactory = new ComponentFactory();
		compFactory.registerComponentType(Actor);

		let world = new World(compFactory);
		world.addComponentPool(Actor, 1000);
		world.addSystem(new TextRenderSystem(world));
		let newEntity = world.spawnEntity([Actor]);
	}

	run() {
		//let actor = new Actor(new Position(200, 200), new Shape('@'));
		this.grid.set_value(2, 2, '@');
		this.flush();
		super.run();
	}

	recv_event(event:Event) {
		if (event instanceof InputEvent) {
			console.log(event.text);
		}
	}

	move_character(row:number, col:number) {

	}
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "ex01" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		let grid = new Grid(10, 5, ' ');
		let app = new ExampleApplication(50, grid);
		app.run();
		// Display a message box to the user
		//vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
