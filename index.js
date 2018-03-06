var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongojs = require('mongojs');
var crypto = require('crypto');
var math = require('mathjs');



var connected_clients = [];
var unique_id = "a";

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

/**
 * Database class, used to create a database object to interact with database on db_url
 * @param {string} db_url - url of database
 */
class Database {
    constructor(db_url) {
        this.db = mongojs(db_url)
        this.collection_players = this.db.collection('players');

        this.player_exists = function (username, cb) {
            this.collection_players.find({ username: username }, function (err, docs) {
                if (docs.length > 0) cb(docs[0]);
                else cb(false);
            });
        }

        this.create_player = function (username, password, cb) {
            this.collection_players.insert({ username: username, password: password, x: 100, y: 100, location: "main", inventory: {}, max_health: 100, health:100, xp: 0 }, function (err, res) {
                if (err) throw err;
                cb(true);
            });
        }

        this.update_player = function (e, cb) {
            this.collection_players.update({ username: e.username }, { $set: { x: e.position.x, y: e.position.y, location : e.location, inventory : e.inventory, max_health : e.max_health, health : e.health, xp : e.xp} } , function (err) {
            });
        }
    }


    is_player_online(player_username) {
        for (var entity_id in entity_list) {
            if (entity_list[entity_id] instanceof Player)
                if (entity_list[entity_id].username == player_username) {
                    return true;
                }
        }
        return false;
    }

    static generate_unique_id() {
        do {
            var id = crypto.randomBytes(16).toString("hex");
        } while (Location.find_entity_by_id(id) != false);
        return id;
    }
    
}

var db_url = "mongodb://localhost:27017/local";
db = mongojs(db_url)
collection_players = db.collection('players');

database = new Database(db_url);

class Location {
    constructor(name,map,size) {
        this.name = name;
        this.map = map;
        this.map_size_x = size.x;
        this.map_size_y = size.y;
        this.interactive_objects = [];
    }

    static find_player_location_by_socket_id(socket_id) {
        var entity = find_player_entity_by_socket_id(socket_id);
        if (entity) {
            return entity.location;
        }
        return false;
    }

    static find_entity_by_id(id) {
        if (entity_list[id]) {
            return entity_list[id];
        }
        return false;
    }

    static find_player_entity_by_socket_id(socket_id) {
        for (var entity in entity_list) {
            if (entity_list[entity] instanceof Player) {
                var found_entity = entity_list[entity];
                if (found_entity.socket.id == socket_id) {
                    return found_entity;
                }
            }
        }
        return false;
    }

    static find_all_players_in_location(location) {
        var list_of_players_in_location = [];
        for (var entity in entity_list) {
            var entity = entity_list[entity];
            if (entity instanceof Player && entity.location == location) {
                list_of_players_in_location.push(entity.id);
            }
        }
        return list_of_players_in_location;
    }

    static find_all_entities_in_location(location) {
        var list_of_all_entities_in_location = [];
        for (var entity in entity_list) {
            var entity = entity_list[entity];
            if (entity.location == location) {
                list_of_all_entities_in_location.push(entity.id);
            }
        }
        return list_of_all_entities_in_location;
    }
}

/**
 * Position class, used to create a position object to hold all information about map location
 * @param {int} x - coords of x position
 * @param {int} y - coords of y position
 */


var location_list = [];
location_list["main"] = new Location("main", "xxxxxxxxxxxxxxxxooooooxxxooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooxoboxoxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxxxxxxxxxxxxxxx", { x : 15 , y : 20});
location_list["main"].interactive_objects.push({ x: 400, y: 400, command: { name: "change_location", location: "secondary" , x: 420, y : 60} });
location_list["secondary"] = new Location("secondary", "xxxxxxxxxxxxxxxxoooooooooooooxxoooooooooooooxxoooooooooboooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxoooooooooooooxxxxxxxxxxxxxxxx", { x: 15, y: 20 });
location_list["secondary"].interactive_objects.push({ x: 400, y: 120, command: { name: "change_location", location: "main", x : 420, y : 460 } });

var entity_list = [];

class Entity {    
    constructor(id, x, y, name = null, location = "main") {

        this.id = id;
        this.position = new Position(x, y);
        this.entity_type = this.constructor.name;
        this.name = name;
        this.location = location;
        this.location_change_time = Date.now();

    }

    /**
     * Spawns the new entity on all player clients, including on itself if it is a new player being created
     */
    spawn() {
        entity_list[this.id] = this;
        Player.spawn_entity(this.id, this.entity_type, this.position.x, this.position.y, this.name, this.location, this.max_health, this.health, this.level);
    }

    /**
     * Despawn an entity from all player clients and removes it from entity_list.
     */
    despawn() {
        Player.despawn_entity(this.id,this.location);
        delete entity_list[this.id];
    }

   

    /**
     * Checks if the entity is interacting with a interactive map object and executes the command of said object if true.
     */
    interaction_map_objects() {
        var interactive_collisions_list = Position.collides_with_interactive_map_object(this.position.x, this.position.y, this.location);
        for (var i = 0; i < interactive_collisions_list.length; i++) {
            var interactive_collision = interactive_collisions_list[i];
            if (interactive_collision.command.name == "change_location") {
                if (this.location_change_time + 5000 <= Date.now()) {
                    this.change_location(interactive_collision.command.location, interactive_collision.command.x, interactive_collision.command.y);
                    this.location_change_time = Date.now();
                }
                break;
            }
        }
    }

}

class Movable extends Entity {

    constructor(id, x, y, name = null, location = "main", max_health = 100, health = 100, xp = 0) {

        super(id, x, y, name, location);

        this.max_health = max_health;
        this.health = health;
        this.time_last_damage = Date.now();
        this.list_damage_taken = [];
        this.dead = false;

        this.xp = xp;
        this.level = this.get_level();

        this.attack_last_attack = Date.now();
        this.attack_cooldown = 1000;
        this.attack_range = 100;
        this.attack_damage = 10;
    }
    /**
     * Despawns and shares xp. TODO change each component into their own class, and leave this has super method.
     */
    death() {
        if (this instanceof Monster) {
            this.share_xp();
        }
        if (!(this instanceof Player)) {
            Player.death_of_entity(this.id, this.location);
            this.despawn();
            //Drop items, xp, etc.
        } else {
            this.dead = true;
            Player.death_of_entity(this.id, this.location);
            Player.self_player_died(this.id);
        }
    }

    /**
     * Changes the location of an entity and updates the user clients, despawning from the current location and spawning in the new.
     * @param {string} location - Name of the location to transport the entity to.
     * @param {int} x - x position to change to on new location.
     * @param {int} y - y position to change to on new location.
     */
    change_location(location, x = this.x, y = this.y) {
        Player.despawn_entity(this.id, this.location);
        this.position.x = x;
        this.position.y = y;
        Player.spawn_entity(this.id, this.entity_type, this.position.x, this.position.y, this.name, location, this.max_health, this.health, this.level);
        this.location = location;
        if (this instanceof Player) this.load_map();
        if (this instanceof Player) this.spawn_entities_on_login();
    }

    /**
     * Changes the position of an entity and sends and update to all connected clients via Player.send_update()
     * @param {number} x
     * @param {number} y
     */
    move(x, y) {
        if (x > 5000) {
            x = 5000;
        }
        if (y > 5000) {
            y = 5000;
        }
        if (x < 0) {
            x = 0;
        }
        if (y < 0) {
            y = 0;
        }
        var collides = Position.collides_with_map(x, y, this.location);
        //Check if vertical or horizonal collision and allow the other to move
        if (!collides) {
            this.position.x = x;
            this.position.y = y;
        }
        else if (!Position.collides_with_map(this.position.x, y, this.location)) {
            this.position.y = y;
            x = this.position;
        }
        else if (!Position.collides_with_map(x, this.position.y, this.location)) {
            this.position.x = x;
            y = this.position;
        } else {
            return false;
        }
        Player.send_update(this.id, x, y, this.location, this.rotation, this.max_health, this.health, this.level);
    }

    /**
     * Attacks every entity around the way this entity is looking. TODO might not work for monsters, has those dont update rotation. Monster tick_update needs to change rotation to current target TODO
     */
    attack_around() {
        var entities_in_location = Location.find_all_entities_in_location(this.location);
        for (var i = 0; i < entities_in_location.length; i++) {
            if (entities_in_location[i] != this.id && !entities_in_location[i].dead) {
                var entity = entity_list[entities_in_location[i]];
                var distance = Position.distance(entity.position, this.position);
                if (distance < this.attack_range && !(entity instanceof Player) && (entity instanceof Movable)) {
                    var unitary_vector = Position.unitary_distance_vector(this.position, this.mouse_pos);
                    var front_point = new Position(this.position.x + unitary_vector.x * this.attack_range, this.position.y + unitary_vector.y * this.attack_range);
                    if (Position.distance(entity.position, front_point) < this.attack_range) {
                        entity.get_hit(this.attack_damage, this.id);
                    }
                }
            }
        }
    }

    /**
     * Directly attacks an entity by its id.
     * @param {any} target_id
     */
    attack_entity(target_id) {
        var target = entity_list[target_id];
        if (Position.distance(target.position, this.position) < this.attack_range) {
            target.get_hit(this.attack_damage, this.id);
            this.attack_last_attack = Date.now();
        }

    }

    /**
     * Reduces health of entity hit by another entity. Temporary function, needs to be changed to account for the items both the victim and the attacker are using. And also different attack types. TODO
     * @param {any} hit_damage
     * @param {any} attacker_id
     */
    get_hit(hit_damage, attacker_id) {
        this.health -= hit_damage;
        this.time_last_damage = Date.now();
        if (this.health <= 0) { //Remporary to adjust for current hit_damage
            hit_damage = hit_damage + this.health;
        }
        this.list_damage_taken.push({ id: attacker_id, damage: hit_damage });
        if (this.health <= 0) {
            this.death();
        } else {
            Player.send_update(this.id, this.x, this.y, this.location, this.rotation, this.max_health, this.health, this.level);
        }
    }

    /**
     * Gives xp to the entity. TODO add to Player class and let this one be super.
     * @param {any} xp
     */
    recieve_xp(xp) {
        this.xp += xp;
        var level = this.get_level();
        if (level > this.level) {
            this.level = level;
            this.level_up();
            Player.send_update(this.id, this.position.x, this.position.y, this.location, this.rotation, this.max_health, this.health, this.level);
        }
        if (this instanceof Player) {
            this.update_xp();
        }
    }

    /**
     * Regens the health of the entity by 1% after 5 seconds of being attacked.
     */
    regen() {
        if (this.time_last_damage + 5000 <= Date.now()) {
            this.health += this.max_health * 0.01;
            if (this.health > this.max_health) {
                this.health = this.max_health;
                this.list_damage_taken = [];
            }
            Player.send_update(this.id, this.x, this.y, this.location, this.rotation, this.max_health, this.health, this.level);
        }
    }
}

class Player extends Movable {
    constructor(id, x, y, socket, username, name, location, inventory, max_health, health, xp) {

        super(id, x, y, username, location, max_health, health, xp);
        
        this.socket = socket;

        this.username = username;
        this.name = username;

        this.inventory = new Inventory(inventory);
        this.update_inventory();

        this.update_xp();

        this.keys = {}
        this.mouse_pos = { x: 0, y: 0 }

        this.load_map();
        this.spawn_entities_on_login();

        this.spawn();
    }


    /**
     * Fired by the game loop, executes every function related to the entity that needs to be always updating 
     */
    tick_update() {
        this.regen();
        this.interaction_map_objects();
    }
    /**
     * Spawns all entities on entity_list on the client that calls the function.
     */
    spawn_entities_on_login() {
        for (var entity in entity_list) {
            var entity = entity_list[entity];
            if (entity.location == this.location) {
                this.socket.emit('spawn_entity', { id: entity.id, entity_type: entity.entity_type, x: entity.position.x, y: entity.position.y, name: entity.name, max_health: entity.max_health, health : entity.health, level : entity.level });
            }
        }
    }

    /**
     * Respawns the player at 100,100,main. Needs to be changed to take parameters. TODO
     */
    respawn() {
        this.position.x = 100;
        this.position.y = 100;
        this.health = this.max_health;
        this.dead = false;
        this.change_location("main", this.position.x, this.position.y);
        this.update_inventory();
    }

    /**
     * Returns the level of the player. Uses equation to determine the level of the player by knowing his xp. TODO change into a static equation that returns the xp needed to level up and one that given xp returns the level
     */
    get_level() {
        return math.floor(this.xp / 10);
    }

    /**
     * Increases the stats of the player at the moment of level up and updates the database with new values.
     */
    level_up() {
        database.update_player(this);
        //TODO update dmg, health, max_health etc
    }

    /**
     * Sends socket signal to load the location the player is in.
     */
    load_map() {
        this.socket.emit('load_map', { map: location_list[this.location].map, map_size_x: location_list[this.location].map_size_x, map_size_y: location_list[this.location].map_size_y });
    }

    /**
     * Sends socket signal to update the player's inventory.
     */
    update_inventory() {
        this.socket.emit('update_inventory', { inventory : this.inventory.item_list});
    }

    /**
     * Sends socket signal to update the player's xp and level.
     */
    update_xp() {
        this.socket.emit('update_xp', {xp : this.xp, level : this.level});
    }

    /**
     * Updates the player's pressed keys
     * @param {any} keys
     */
    update_keys(keys) {
        this.keys = keys;
    }

    /**
     * Uses the list keys to call the proper actions for each key press. TODO player options to change what key does what. this.keyoptions = {"move_up":87,"move_down":83}
     */
    use_keys() {
        if (Object.keys(this.keys).length && !this.dead/*&& !this.keys[18]*/) {
            var x_change = 0;
            var y_change = 0;
            if (this.keys[87]) {
                y_change -= 10;
            }
            if (this.keys[83]) {
               y_change += 10;
            }
            if (this.keys[65]) {
               x_change -= 10;
            }
            if (this.keys[68]) {
                x_change += 10;
            }
            if (x_change || y_change) {
                x_change = (x_change / (x_change ** 2 + y_change ** 2)) * 100;
                y_change = (y_change / (x_change ** 2 + y_change ** 2)) * 100;
                this.move(this.position.x + x_change, this.position.y + y_change);
            }
            if (this.keys[67] && this.location_change_time + 1000 <= Date.now()) {
                if (this.location == "main") this.change_location("secondary");
                else this.change_location("main", 100, 100);
                this.location_change_time = Date.now();
            }

            if (this.keys[32] && (this.attack_last_attack + this.attack_cooldown <= Date.now())) {
                this.attack_around();
                this.attack_last_attack = Date.now();
            }
        }
    }

    /**
     * Updates the players rotation to a given x and y.
     * @param {{x,y}} mouse_pos
     */
    update_rotation(mouse_pos) {
        this.mouse_pos = mouse_pos;
        if (!this.dead){
            this.rotation = math.atan((mouse_pos.y - this.position.y) / (mouse_pos.x - this.position.x)) * 180 / math.pi;
            Player.send_update(this.id, this.position.x, this.position.y, this.location, this.rotation, this.max_health, this.health, this.level);
        }
    }

    /**
     * Spawns an entity in all connected clients in a certain location. x and y default to 0. Should be called by the entity on the moment of its creation.
     *
     * @param {any} id
     * @param {any} type
     * @param {int} x - x coordinate to spawn entity
     * @param {int} y - y coordinate to spawn entity
     */
    static spawn_entity(id, entity_type, x = 0, y = 0, name = "", location, max_health, health, level) {
        var players_in_location = Location.find_all_players_in_location(location);
        for (var i = 0; i < players_in_location.length; i++) {
            var player_id = players_in_location[i];
            entity_list[player_id].socket.emit('spawn_entity', { id: id, entity_type: entity_type, x: x, y: y, name: name, max_health : max_health, health : health, level : level });
        }
    }

    /**
     * Despawn an entity on all clients using its id and location.
     * @param {any} id
     * @param {any} location
     */
    static despawn_entity(id, location) {
        var players_in_location = Location.find_all_players_in_location(location);
        for (var i = 0; i < players_in_location.length; i++) {
            var player_id = players_in_location[i];
            entity_list[player_id].socket.emit('despawn_entity', { id: id });
        }
    }

    /**
     * Sets dead flag for an entity on all clients using its id and location.
     * @param {any} id
     * @param {any} location
     */
    static death_of_entity(id, location) {
        var players_in_location = Location.find_all_players_in_location(location);
        for (var i = 0; i < players_in_location.length; i++) {
            var player_id = players_in_location[i];
            entity_list[player_id].socket.emit('dead_entity', { id: id });
        }
    }

    /**
     * Signals the player that his character has died.
     * @param {any} id
     */
    static self_player_died(id) {
        var player = entity_list[id];
        player.socket.emit("self_player_died");
    }

    /**
     * Updates a especific entity by its id. If the parameter isnt given it defaults to null, meaning it shouldnt change.
     *
     * @param {any} id
     * @param {any} x
     * @param {any} y
     */
    static send_update(id, x = null, y = null, location, rotation, max_health, health, level) {
        var players_in_location = Location.find_all_players_in_location(location);
        for (var i = 0; i < players_in_location.length; i++) {
            var player_id = players_in_location[i];
            entity_list[player_id].socket.emit('update_entity', { id: id, x: x, y: y, rotation: rotation, max_health: max_health, health: health, level : level });
        }
    }


}

class Monster extends Movable{
    constructor(id, x, y, name, location, max_health, health, xp) {

        super(id,x,y,name,location,max_health,health,xp);

        this.target = null;
        this.xp_drop = this.get_xp_drop();
        this.agro = "agro";

        this.spawn();
    }

    tick_update() {
        this.regen();
        if (entity_list[this.target] && entity_list[this.target].location == this.location && !entity_list[this.target].dead) {
            if (Position.distance(this.position, entity_list[this.target].position) > 500) {
                this.target = null;
            }
        } else {
            this.target = null;
            if (this.agro == "agro") {
                var players_in_location = Location.find_all_players_in_location(this.location);
                for (var i = 0; i < players_in_location.length; i++) {
                    var player = entity_list[players_in_location[i]];
                    var distance_between = Position.distance(player.position, this.position);
                    if (distance_between < 300 && !player.dead) {
                        this.target = player.id;
                    }
                }
            }
        }
        if (this.target) {
            var distance = Position.distance(this.position, entity_list[this.target].position);
            if (distance > 50) {
                var unitary_vector = Position.unitary_distance_vector(this.position, entity_list[this.target].position, distance);
                var move_x = 5 * unitary_vector.x;
                var move_y = 5 * unitary_vector.y;
                this.move(this.position.x + move_x, this.position.y + move_y);
            }
            if (this.attack_last_attack + this.attack_cooldown <= Date.now()) {
                this.attack_entity(this.target);
            }
        }
    }

    get_level() {
        return (this.xp / 2);
    }

    level_up() {
        //TODO
    }

    get_xp_drop() {
        return 10;
    }

    share_xp() {
        var total_damage = 0;
        var damage_dealers = [];
        for (var i = 0; i < this.list_damage_taken.length; i++) {
            var damage = this.list_damage_taken[i];
            if (damage.id) {
                console.log(damage.damage);
                if (damage_dealers[damage.id]) {
                    damage_dealers[damage.id] += damage.damage;
                } else {
                    damage_dealers[damage.id] = damage.damage;
                }
                total_damage += damage.damage;
            }
        }
        console.log(damage_dealers);
        for (var damage_dealer in damage_dealers) {
            entity_list[damage_dealer].recieve_xp((damage_dealers[damage_dealer] / total_damage) * this.xp_drop);
        }
    }
}

class Unmovable extends Entity {
    constructor(id,x,y,name,location) {
        super(id, x, y, name, location);

        this.spawn();
    }
}

class Position {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Returns the distance between 2 Position objects.
     * @param {Position} a - Position a
     * @param {Position} b - Position b
     * @return {number} Distance between a and b
     */
    static distance(a, b) {
        var root = math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
        return root;
    }

    static unitary_distance_vector(a,b,distance = null) {
        if (!distance) {
            distance = Position.distance(a, b);
        }
        var vector_x = (b.x - a.x) / distance;
        var vector_y = (b.y - a.y) / distance;
        return { x: vector_x, y: vector_y };
    }

    static collides_with_map(x, y, map) {
        var map_string = location_list[map].map;
        var i = 0;
        for (var map_y = 0; map_y < location_list[map].map_size_y; map_y++) {
            for (var map_x = 0; map_x < location_list[map].map_size_x; map_x++) {
                if ((x >= (40 * map_x) && x <= (40 * map_x + 40)) && (y >= (40 * map_y) && y <= (40 * map_y + 40)) && map_string[i] != "o" && map_string[i] != "b" ) {
                    return true;
                }
                i++;
            }
        }
        return false;
    }

    static collides_with_interactive_map_object(x,y,map) {
        var map_objects = location_list[map].interactive_objects;
        var map_objects_colliding = [];
        for (var i = 0; i < map_objects.length; i++) {
            if ((x >= map_objects[i].x && x <= map_objects[i].x + 40) && (y >= map_objects[i].y && y <= (map_objects[i].y + 40))) {
                var object = map_objects[i];
                map_objects_colliding.push(object);
            }
        }
        return map_objects_colliding;
    }
}

class Inventory {
    constructor(existing_inventory) {
        this.item_list = [];

        if (existing_inventory) {
            for (var i = 0; i < existing_inventory.length; i++) {
                var item = existing_inventory[i];
                switch (item.type) {
                    case "Weapon":
                        item.type = Weapon;
                    case "Helmet":
                        item.type = Helmet;
                    case "Chestplate":
                        item.type = Chestplate;
                    case "Boots":
                        item.type = Boots;
                    default:
                        item.type = Item;
                }
                this.add_item(new (item.type)(item.id));
            }
        }
    }

    add_item(item) {
        this.item_list.push(item);
    }

    remove_item(item) {
        delete this.item_list[item];
    }
}

class Equips {
    constructor(weapon, helmet, chestplate, boots) {
        this.weapon = weapon;
        this.helmet = helmet;
        this.chestplate = chestplate;
        this.boots = boots;
    }
}

class Item {
    constructor(id) {
        this.id = id;
    }
}
/**
 * Weapon Class and extensions
 */
class Weapon extends Item {

}
/**
 * Armor Class and extensions
 */
class Armor extends Item {

}
class Helmet extends Armor {

}
class Chestplate extends Armor {

}
class Boots extends Armor {

}

var unique_id = Database.generate_unique_id();
new Monster(unique_id, 100, 100, name = "Palhaco");
var unique_id = Database.generate_unique_id();
new Unmovable(unique_id, 200, 300, name = "Item", position = "main");
/* On Player connect*/
io.on('connection', function (socket) {

    socket.on('login', function (login_info) {
        console.log("New connection id: " + socket.id + " , ip: " + socket.request.connection.remoteAddress + " , username: " + login_info.username);

        database.player_exists(login_info.username, function (result) {
            if (result) {
                if (!database.is_player_online(result.username) && login_info.password == result.password) { //Sucessful login
                    var unique_id = Database.generate_unique_id();
                    var player = new Player(unique_id, result.x, result.y, socket, result.username, result.username, result.location, result.inventory, result.max_health, result.health, result.xp);
                    var unique_id = Database.generate_unique_id();
                } else { //Error logging in
                    console.log("Could not login user with ip " + socket.request.connection.remoteAddress)
                    socket.emit("disconnect");
                }
            } else { //No player with requested username
                database.create_player(login_info.username, login_info.password, function (result) {
                    if (result) {
                        var unique_id = Database.generate_unique_id();
                        new Player(unique_id, 100, 100, socket, username = login_info.username, login_info.username, location = "main", inventory = null, 100, 100, 0);
                    }
                });
            }
        });
    });

    /* On Player disconnect */
    socket.on('disconnect', function () {
        var entity = Location.find_player_entity_by_socket_id(socket.id);
        if (entity) {
            database.update_player(entity, function (result) {
                console.log(result);
            }); 
            entity.despawn();
        }
    })

    socket.on('update_keys', function (keys) {
        var entity = Location.find_player_entity_by_socket_id(socket.id);
        if (entity) {
            entity.update_keys(keys);
        }
    });

    socket.on('update_mouse', function (mouse_pos) {
        var entity = Location.find_player_entity_by_socket_id(socket.id);
        if (entity) {
            entity.update_rotation(mouse_pos);
        }
    })

    socket.on('respawn', function () {
        var entity = Location.find_player_entity_by_socket_id(socket.id);
        if (entity && entity.dead) {
            entity.respawn();
        }
    });

});

function myFunction() {
    for (var entity in entity_list) {
        var entity = entity_list[entity];
        if (entity instanceof Player && !this.dead) {
            entity.use_keys();
            entity.tick_update();
        }
        if (entity instanceof Monster) {
            entity.tick_update();
        }
    }
}setInterval(myFunction, 50);


http.listen(3000, function () {
    console.log('listening on *:3000');
});
