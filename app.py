import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory, abort
from datetime import datetime
from werkzeug.utils import secure_filename

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(APP_DIR, "data.json")
UPLOAD_FOLDER = os.path.join(APP_DIR, "uploads")
ALLOWED_EXTENSIONS = None  # None => allow any file types; change if you want restrictions

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB max (adjust if needed)

# --- Persistence helpers ---
def load_data():
    if not os.path.exists(DATA_FILE):
        data = {"channels": {"Channel #1": []}}
        save_data(data)
        return data
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

data = load_data()

def allowed_file(filename):
    if ALLOWED_EXTENSIONS is None:
        return True
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Routes ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/channels")
def api_channels():
    # return list of channel names
    return jsonify(list(data["channels"].keys()))

@app.route("/api/messages/<channel>")
def api_messages(channel):
    channels = data["channels"]
    if channel not in channels:
        return jsonify([]) 
    return jsonify(channels[channel])

@app.route("/api/send/<channel>", methods=["POST"])
def api_send(channel):
    if channel not in data["channels"]:
        return abort(404)
    name = (request.form.get("name") or "").strip()[:64]
    msg = (request.form.get("message") or "").strip()
    file = request.files.get("file")

    entry = {
        "name": name or "Anonymous",
        "message": msg,
        "time": datetime.utcnow().isoformat() + "Z",
        "file": None
    }

    if file and file.filename:
        if allowed_file(file.filename):
            filename = secure_filename(file.filename)
            # avoid collisions: prefix with timestamp
            ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
            final_name = f"{ts}_{filename}"
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], final_name)
            file.save(save_path)
            entry["file"] = final_name
        else:
            return "File type not allowed", 400

    data["channels"][channel].append(entry)
    save_data(data)
    return "", 204

@app.route("/api/add_channel", methods=["POST"])
def api_add_channel():
    # create Channel #N
    n = len(data["channels"]) + 1
    new_name = f"Channel #{n}"
    # ensure unique name if renamed deleted etc:
    base = new_name
    i = 1
    while new_name in data["channels"]:
        i += 1
        new_name = f"{base}-{i}"
    data["channels"][new_name] = []
    save_data(data)
    return jsonify({"name": new_name})

@app.route("/api/rename_channel", methods=["POST"])
def api_rename_channel():
    payload = request.json
    old = payload.get("old")
    new = payload.get("new")
    if not old or not new:
        return "Bad request", 400
    if old not in data["channels"]:
        return "Old channel not found", 404
    # if new exists already, reject
    if new in data["channels"] and new != old:
        return "Name already taken", 409
    data["channels"][new] = data["channels"].pop(old)
    save_data(data)
    return "", 204

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    # serve uploaded files
    safe = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(safe):
        return abort(404)
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=False)

# Run accessible on LAN
if __name__ == "__main__":
    # host=0.0.0.0 makes it reachable from other devices on your LAN
    app.run(host="0.0.0.0", port=80, debug=False)
