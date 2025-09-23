#!/bin/bash

echo "Testing URL manipulation logic..."

# Test cases
test_urls=(
    "https://courtlistener-mcp.blakeopowell.workers.dev/health"
    "https://courtlistener-mcp.blakeopowell.workers.dev/sse"
    "https://courtlistener-mcp.blakeopowell.workers.dev"
    "https://example.com/health"
    "https://example.com/sse"
)

for url in "${test_urls[@]}"; do
    echo "Testing URL: $url"
    
    # This simulates our workflow logic for MCP endpoint
    if [[ "$url" == *"/health" ]]; then
        mcp_endpoint="${url%/health}/sse"
    elif [[ "$url" == *"/sse" ]]; then
        mcp_endpoint="$url"
    else
        mcp_endpoint="$url/sse"
    fi
    
    # This simulates our workflow logic for health endpoint
    if [[ "$url" == *"/sse" ]]; then
        health_endpoint="${url%/sse}/health"
    elif [[ "$url" == *"/health" ]]; then
        health_endpoint="$url"
    else
        health_endpoint="$url/health"
    fi
    
    echo "  → MCP endpoint would be: $mcp_endpoint"
    echo "  → Health check would use: $health_endpoint"
    echo ""
done

echo "✅ URL manipulation tests completed"
