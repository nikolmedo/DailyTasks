#!/bin/bash

# Daily Tasks - Script de Inicio
# Este script inicia el servidor de Daily Tasks en el puerto 5000

echo "=========================================="
echo "  Daily Tasks - Starting Server"
echo "=========================================="
echo ""

# Cambiar al directorio del backend
cd "$(dirname "$0")/backend"

# Verificar que node_modules existe
if [ ! -d "node_modules" ]; then
    echo "⚠️  node_modules not found. Installing dependencies..."
    npm install
    echo ""
fi

# Iniciar el servidor en el puerto 5000
echo "🚀 Starting server on port 5000..."
echo ""
echo "Access the web panel at:"
echo "  Local: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

PORT=5000 node server.js
