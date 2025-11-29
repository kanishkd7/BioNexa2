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
                        npm install
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
                        sh 'npm install'
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
                            -Dsonar.token=sqp_9e7ba322bc1dd47884059b67ab927142058408af
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
                        docker tag bionexa-frontend:latest ${NEXUS_HOST}/${NEXUS_REPO}/bionexa-frontend:v1
                        docker tag bionexa-backend:latest  ${NEXUS_HOST}/${NEXUS_REPO}/bionexa-backend:v1

                        docker push ${NEXUS_HOST}/${NEXUS_REPO}/bionexa-frontend:v1
                        docker push ${NEXUS_HOST}/${NEXUS_REPO}/bionexa-backend:v1
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

                        echo "===== Applying Deployment ====="
                        kubectl apply -n ${NAMESPACE} -f k8s/deployment.yaml

                        echo "===== Applying Service ====="
                        kubectl apply -n ${NAMESPACE} -f k8s/service.yaml

                        echo "===== Rollout Status ====="
                        kubectl rollout status deployment/bionexa-frontend -n ${NAMESPACE} --timeout=60s || true
                        kubectl rollout status deployment/bionexa-backend -n ${NAMESPACE} --timeout=60s || true

                        echo "===== Pods ====="
                        kubectl get pods -n ${NAMESPACE}
                    '''
                }
            }
        }
    }
}
