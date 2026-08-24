# Contributing to ProcureFlow

Thank you for considering contributing to ProcureFlow! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors. We expect:

- **Respectful Communication**: Be kind and considerate in all interactions
- **Constructive Feedback**: Provide helpful, actionable feedback
- **Collaboration**: Work together towards common goals
- **Inclusivity**: Welcome contributors of all skill levels and backgrounds

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Trolling, insulting, or derogatory remarks
- Publishing others' private information
- Any conduct that would be inappropriate in a professional setting

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report:
1. **Check existing issues** to avoid duplicates
2. **Use the latest version** to confirm the bug still exists
3. **Collect information**: OS, Docker version, error logs

When filing a bug report, include:
- Clear, descriptive title
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)
- Environment details
- Relevant logs

**Bug Report Template:**

```markdown
**Description**
A clear description of the bug.

**To Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Screenshots**
If applicable.

**Environment**
- OS: [e.g., Windows 11]
- Docker version: [e.g., 24.0.5]
- Browser: [e.g., Chrome 118]

**Logs**
Relevant error messages or logs.
```

### Suggesting Enhancements

Enhancement suggestions are welcome! Include:
- Clear use case and motivation
- Detailed description of proposed feature
- Mockups or examples (if applicable)
- Consideration of backward compatibility

### Your First Contribution

Not sure where to start? Look for issues labeled:
- `good first issue` - Simple issues for newcomers
- `help wanted` - Issues where we need assistance
- `documentation` - Documentation improvements

## Development Setup

### Prerequisites

- Docker Desktop 24.0+
- Git 2.30+
- Node.js 18+ (for frontend development)
- Python 3.11+ (for agent development)

### Local Setup

1. **Fork and Clone**

```bash
git clone https://github.com/YOUR_USERNAME/procureflow.git
cd procureflow
```

2. **Create Environment File**

```bash
cp .env.example .env
```

3. **Start Development Environment**

```bash
docker-compose up -d --build
```

4. **Verify Services**

```bash
docker ps
curl http://localhost:8000/health
curl http://localhost:3000
```

### Development Workflow

**Backend (Python) Development:**

```bash
# Work on a specific service
cd services/agent2-inventory

# Install dependencies locally (for IDE support)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Make changes, then rebuild
docker-compose build agent2-inventory
docker-compose up -d agent2-inventory

# View logs
docker logs procurement_agent2 -f
```

**Frontend (Next.js) Development:**

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

## Coding Standards

### Python (Backend/Agents)

**Style Guide:**
- Follow PEP 8
- Use type hints
- Maximum line length: 100 characters
- Use docstrings for all public functions

**Example:**

```python
from typing import Dict, List, Optional
from pydantic import BaseModel

class InventoryEvaluation(BaseModel):
    """Represents an inventory evaluation result."""
    request_id: int
    total_items: int
    shortage_items: int
    
def evaluate_inventory(request_id: int) -> Dict[str, any]:
    """
    Evaluate inventory availability for a procurement request.
    
    Args:
        request_id: The ID of the procurement request
        
    Returns:
        Dictionary containing evaluation results
        
    Raises:
        ValueError: If request_id is invalid
    """
    # Implementation
    pass
```

**Naming Conventions:**
- Variables/functions: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_CASE`
- Private methods: `_leading_underscore`

### TypeScript/React (Frontend)

**Style Guide:**
- Use TypeScript strict mode
- Use functional components with hooks
- Maximum line length: 100 characters
- Use meaningful variable names

**Example:**

```typescript
interface AgentStatus {
  status: "running" | "offline" | "connecting";
  eventsProcessed: number;
  currentTask?: string;
}

export function AgentCard({ agentId }: { agentId: number }) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  
  useEffect(() => {
    fetchAgentStatus(agentId).then(setStatus);
  }, [agentId]);
  
  return (
    <div className="agent-card">
      {/* Component JSX */}
    </div>
  );
}
```

**Component Organization:**
```
ComponentName/
├── index.tsx           # Main component
├── types.ts            # Type definitions
├── hooks.ts            # Custom hooks
└── utils.ts            # Helper functions
```

### SQL

- Use uppercase for SQL keywords
- Indent nested queries
- Use meaningful table/column names
- Add comments for complex queries

```sql
-- Fetch all purchase orders with vendor details
SELECT 
    po.id,
    po.po_number,
    po.total_price,
    v.vendor_name,
    v.contact_email
FROM purchase_orders po
INNER JOIN vendors v ON po.vendor_id = v.id
WHERE po.status = 'PENDING_APPROVAL'
ORDER BY po.created_at DESC;
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Build process or auxiliary tool changes

**Examples:**

```
feat(agent2): add industry auto-detection

Implement keyword-based industry detection from item descriptions.
Falls back to construction if industry cannot be determined.

Closes #123
```

```
fix(frontend): resolve workflow tracker polling issue

Fixed infinite polling loop when request status is undefined.
Added null checks and error boundaries.

Fixes #456
```

```
docs(readme): update installation instructions

Added troubleshooting section for common Docker issues.
Clarified prerequisite requirements.
```

### Branch Naming

- Feature: `feature/description`
- Bug fix: `fix/description`
- Documentation: `docs/description`
- Refactor: `refactor/description`

Examples:
- `feature/add-approval-workflow`
- `fix/agent3-vendor-scoring`
- `docs/api-documentation`

## Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] All services pass health checks
- [ ] Frontend builds without errors

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed:
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)

## Related Issues
Closes #123
```

### Review Process

1. **Automated Checks**: CI/CD pipeline must pass
2. **Code Review**: At least one maintainer approval required
3. **Testing**: All tests must pass
4. **Documentation**: Updates reviewed

### After Approval

- Squash commits if requested
- Maintainer will merge
- Delete your branch after merge

## Testing Guidelines

### Backend Tests

**Unit Tests:**

```python
import pytest
from agent2.evaluator import evaluate_inventory

def test_evaluate_inventory_success():
    result = evaluate_inventory(request_id=1)
    assert result["request_id"] == 1
    assert "total_items" in result
    assert "shortage_items" in result

def test_evaluate_inventory_invalid_request():
    with pytest.raises(ValueError):
        evaluate_inventory(request_id=-1)
```

**Integration Tests:**

```python
def test_agent_pipeline_e2e(test_client):
    # Create request
    response = test_client.post("/trigger", json={"request_id": 1})
    assert response.status_code == 200
    
    # Verify processing
    status = test_client.get("/status").json()
    assert status["events_processed"] > 0
```

### Frontend Tests

**Component Tests:**

```typescript
import { render, screen } from '@testing-library/react';
import { AgentCard } from './AgentCard';

test('renders agent card with status', () => {
  render(<AgentCard agentId={2} status="running" />);
  expect(screen.getByText(/Agent 2/i)).toBeInTheDocument();
  expect(screen.getByText(/running/i)).toBeInTheDocument();
});
```

### Running Tests

```bash
# Backend
cd services/agent2-inventory
pytest

# Frontend
cd frontend
npm test

# E2E tests
npm run test:e2e
```

## Questions?

- Open a discussion on GitHub
- Check existing documentation
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

**Thank you for contributing to ProcureFlow! 🚀**
