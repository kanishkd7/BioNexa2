pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:

  - name: node
    image: mirror.gcr.io/library/node:20
    command: ["cat"]
    tty: true

  - name: sonar-scanner
    image: sonarsource/sonar-scanner-cli
    command: ["cat"]
    tty: true

  - name: kubectl
    image: bitnami/kubectl:latest
    command:
      - /bin/sh
      - -c
      - sleep infinity
    tty: true
    securityContext:
      runAsUser: 0
      readOnlyRootFilesystem: false
    env:
      - name: KUBECONFIG
        value: /kube/config
    volumeMounts:
      - name: kubeconfig-secret
        mountPath: /kube/config
        subPath: kubeconfig

  - name: dind
    image: docker:dind
    args:
      - "--storage-driver=overlay2"
      - "--insecure-registry=nexus.imcc.com:8085"
      - "--insecure-registry=nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085"
    securityContext:
      privileged: true
    env:
      - name: DOCKER_TLS_CERTDIR
        value: ""

  volumes:
  - name: kubeconfig-secret
    secret:
      secretName: kubeconfig-secret
'''
        }
    }

    environment {
        NAMESPACE = "2401042"
        NEXUS_HOST = "nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085"
        NEXUS_REPO = "bionexa_kanishk"
        NPM_REGISTRY = ""
    }

    stages {

        stage("CHECK") {
            steps {
                echo "Lightweight Jenkinsfile started for ${NAMESPACE}"
            }
        }

        /* FRONTEND BUILD */
        stage('Install + Build Frontend') {
            steps {
                container('node') {
                    sh '''
                        echo "===== Checking npm version ====="
                        npm --version
                        node --version
                        
                        echo "===== Clearing npm cache ====="
                        npm cache clean --force || true
                        
                        echo "===== Configuring npm ====="
                        npm config set fetch-retries 5
                        npm config set fetch-retry-mintimeout 20000
                        npm config set fetch-retry-maxtimeout 120000
                        npm config set fetch-timeout 300000
                        npm config set strict-ssl false
                        
                        # Try to use Nexus registry if available, otherwise use default
                        if [ -n "${NPM_REGISTRY}" ]; then
                            echo "Using Nexus registry: ${NPM_REGISTRY}"
                            npm config set registry ${NPM_REGISTRY}
                        else
                            echo "Using default npm registry"
                        fi
                        
                        echo "===== npm config list ====="
                        npm config list
                        
                        echo "===== Installing dependencies ====="
                        rm -rf node_modules package-lock.json || true
                        
                        # Try npm install with better error handling
                        set +e
                        npm install --verbose --loglevel=verbose 2>&1 | tee npm-install.log
                        INSTALL_EXIT_CODE=$?
                        set -e
                        
                        if [ $INSTALL_EXIT_CODE -ne 0 ]; then
                            echo "===== npm install failed, checking logs ====="
                            tail -100 npm-install.log || true
                            echo "===== Trying with --legacy-peer-deps ====="
                            npm install --legacy-peer-deps --verbose || {
                                echo "===== Install failed, trying without registry override ====="
                                npm config delete registry || true
                                npm install --legacy-peer-deps --verbose || exit 1
                            }
                        fi
                        
                        echo "===== Verifying installation ====="
                        if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/react-scripts" ]; then
                            echo "ERROR: node_modules or react-scripts not found after install"
                            exit 1
                        fi
                        
                        echo "===== Building frontend ====="
                        CI=false npm run build
                    '''
                }
            }
        }

        /* BACKEND INSTALL */
        stage('Install Backend') {
            steps {
                dir('backend') {
                    container('node') {
                        sh '''
                            echo "===== Clearing npm cache ====="
                            npm cache clean --force || true
                            
                            echo "===== Configuring npm ====="
                            npm config set fetch-retries 5
                            npm config set fetch-retry-mintimeout 20000
                            npm config set fetch-retry-maxtimeout 120000
                            npm config set fetch-timeout 300000
                            npm config set strict-ssl false
                            
                            # Try to use Nexus registry if available, otherwise use default
                            if [ -n "${NPM_REGISTRY}" ]; then
                                echo "Using Nexus registry: ${NPM_REGISTRY}"
                                npm config set registry ${NPM_REGISTRY}
                            else
                                echo "Using default npm registry"
                            fi
                            
                            echo "===== Installing dependencies ====="
                            rm -rf node_modules package-lock.json || true
                            
                            # Try npm install with better error handling
                            set +e
                            npm install --verbose --loglevel=verbose 2>&1 | tee npm-install.log
                            INSTALL_EXIT_CODE=$?
                            set -e
                            
                            if [ $INSTALL_EXIT_CODE -ne 0 ]; then
                                echo "===== npm install failed, checking logs ====="
                                tail -100 npm-install.log || true
                                echo "===== Trying with --legacy-peer-deps ====="
                                npm install --legacy-peer-deps --verbose || {
                                    echo "===== Install failed, trying without registry override ====="
                                    npm config delete registry || true
                                    npm install --legacy-peer-deps --verbose || exit 1
                                }
                            fi
                            
                            echo "===== Verifying installation ====="
                            if [ ! -d "node_modules" ]; then
                                echo "ERROR: node_modules not found after install"
                                exit 1
                            fi
                        '''
                    }
                }
            }
        }

        /* DOCKER BUILD */
        stage("Build Docker Images") {
            steps {
                container("dind") {
                    sh """
                        docker build -t bionexa-frontend:latest -f Dockerfile .
                        docker build -t bionexa-backend:latest  -f backend/Dockerfile backend/
                    """
                }
            }
        }

        /* SONARQUBE */
        stage('SonarQube Analysis') {
            steps {
                container('sonar-scanner') {
                    sh '''
                        sonar-scanner \
                            -Dsonar.projectKey=kanishk_2401042 \
                            -Dsonar.sources=backend,frontend \
                            -Dsonar.host.url=http://my-sonarqube-sonarqube.sonarqube.svc.cluster.local:9000 \
                            -Dsonar.token=sqp_98dfc8a327bda31864fb57ce6f8321b8e709ad23
                    '''
                }
            }
        }

        /* LOGIN TO NEXUS */
        stage("Login to Nexus") {
            steps {
                container("dind") {
                    sh """
                        docker login http://${NEXUS_HOST} \
                          -u student \
                          -p Imcc@2025
                    """
                }
            }
        }

        /* PUSH IMAGES */
        stage("Push Images") {
            steps {
                container("dind") {
                    sh """
                        docker tag bionexa-frontend:latest ${NEXUS_HOST}/bionexa-frontend:v1
                        docker tag bionexa-backend:latest  ${NEXUS_HOST}/bionexa-backend:v1

                        docker push ${NEXUS_HOST}/bionexa-frontend:v1
                        docker push ${NEXUS_HOST}/bionexa-backend:v1
                    """
                }
            }
        }

        /* KUBERNETES DEPLOY */
        stage('Deploy to Kubernetes') {
            steps {
                container('kubectl') {
                    sh '''
                        echo "===== Using kubeconfig ====="
                        ls -l /kube || true
                        cat /kube/config || true

                        echo "===== Creating Namespace if it doesn't exist ====="
                        kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

                        echo "===== Creating/Updating imagePullSecret for Nexus ====="
                        kubectl delete secret nexus-secret -n ${NAMESPACE} --ignore-not-found=true
                        kubectl create secret docker-registry nexus-secret \
                          --docker-server=${NEXUS_HOST} \
                          --docker-username=student \
                          --docker-password=Imcc@2025 \
                          --docker-email=dummy@example.com \
                          -n ${NAMESPACE}

                        echo "===== Applying Deployment ====="
                        kubectl apply -n ${NAMESPACE} -f k8s/deployment.yaml

                        echo "===== Applying Service ====="
                        kubectl apply -n ${NAMESPACE} -f k8s/service.yaml

                        echo "===== Applying Ingress (if present) ====="
                        kubectl apply -n ${NAMESPACE} -f k8s/ingress.yaml || true

                        echo "===== Waiting 10 seconds for pods to start ====="
                        sleep 10

                        echo "===== Pod Status ====="
                        kubectl get pods -n ${NAMESPACE} -o wide

                        echo "===== Frontend Pod Events (if exists) ====="
                        FRONTEND_POD=$(kubectl get pods -n ${NAMESPACE} -l app=bionexa-frontend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
                        if [ -n "$FRONTEND_POD" ]; then
                            kubectl describe pod $FRONTEND_POD -n ${NAMESPACE} | tail -20 || true
                        fi

                        echo "===== Backend Pod Events (if exists) ====="
                        BACKEND_POD=$(kubectl get pods -n ${NAMESPACE} -l app=bionexa-backend -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
                        if [ -n "$BACKEND_POD" ]; then
                            kubectl describe pod $BACKEND_POD -n ${NAMESPACE} | tail -20 || true
                        fi

                        echo "===== Rollout Status ====="
                        kubectl rollout status deployment/bionexa-frontend -n ${NAMESPACE} --timeout=300s || true
                        kubectl rollout status deployment/bionexa-backend -n ${NAMESPACE} --timeout=300s || true

                        echo "===== Final Pod Status ====="
                        kubectl get pods -n ${NAMESPACE}
                    '''
                }
            }
        }
    }
}
